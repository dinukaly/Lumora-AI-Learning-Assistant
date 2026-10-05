import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { config } from '../src/config/index.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';
import User from '../src/modules/users/user.model.js';

type MockGoogleProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
  sub: string;
};

type MockAuthorizationSession = {
  accessToken: string;
  nonce: string;
  profile: MockGoogleProfile;
};

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const newGoogleEmail = `verify-t88-google-${timestamp}@example.com`;
  const linkEmail = `verify-t88-link-${timestamp}@example.com`;
  const failedLinkEmail = `verify-t88-fail-${timestamp}@example.com`;
  const createdEmails = [newGoogleEmail, linkEmail, failedLinkEmail];
  const appServer = app.listen(0);
  const mockGoogleState = createMockGoogleState();
  const mockGoogleServer = http.createServer((req, res) => {
    void handleMockGoogleRequest(req, res, mockGoogleState);
  });
  const originalOauthConfig = {
    ...config.oauth.google,
  };

  try {
    await new Promise<void>((resolve) => appServer.once('listening', () => resolve()));
    await new Promise<void>((resolve) => mockGoogleServer.listen(0, '127.0.0.1', () => resolve()));

    const appAddress = appServer.address();
    const mockAddress = mockGoogleServer.address();
    if (!appAddress || typeof appAddress === 'string' || !mockAddress || typeof mockAddress === 'string') {
      throw new Error('Could not determine server port');
    }

    const baseUrl = `http://127.0.0.1:${appAddress.port}`;
    const mockBaseUrl = `http://127.0.0.1:${mockAddress.port}`;
    const redirectUri = `${baseUrl}/api/v1/auth/oauth/google/callback`;
    const { publicJwk } = mockGoogleState.keys;

    config.oauth.google.enabled = true;
    config.oauth.google.clientId = 'lumora-google-client-id';
    config.oauth.google.clientSecret = 'lumora-google-client-secret';
    config.oauth.google.redirectUri = redirectUri;
    config.oauth.google.frontendCallbackUrl = 'http://localhost:5173/auth/google/callback';
    config.oauth.google.authorizationUrl = `${mockBaseUrl}/authorize`;
    config.oauth.google.tokenUrl = `${mockBaseUrl}/token`;
    config.oauth.google.userInfoUrl = `${mockBaseUrl}/userinfo`;
    config.oauth.google.discoveryUrl = `${mockBaseUrl}/.well-known/openid-configuration`;

    mockGoogleState.discovery = {
      issuer: mockBaseUrl,
      jwksUri: `${mockBaseUrl}/jwks`,
      clientId: config.oauth.google.clientId,
      publicJwk,
    };

    const signupResult = await runGoogleFlow(baseUrl, mockGoogleState, {
      email: newGoogleEmail,
      emailVerified: true,
      name: 'Google Signup User',
      picture: 'https://example.com/google-signup-user.png',
      sub: `google-signup-${timestamp}`,
    });
    assert.equal(signupResult.status, 200);
    assert.equal(signupResult.body.user.email, newGoogleEmail);
    assert.ok(signupResult.body.user.emailVerifiedAt);
    const googleSignupUser = await User.findOne({ email: newGoogleEmail });
    assert.ok(googleSignupUser);
    assert.equal(googleSignupUser?.passwordHash, undefined);
    assert.deepEqual(googleSignupUser?.authProviderSummary, ['google']);
    assert.equal(googleSignupUser?.avatar, 'https://example.com/google-signup-user.png');
    const googleSignupIdentity = await AuthIdentity.findOne({
      provider: 'google',
      providerUserId: `google-signup-${timestamp}`,
    });
    assert.ok(googleSignupIdentity);
    assert.equal(googleSignupIdentity?.emailVerifiedAtProvider, true);

    const repeatLoginResult = await runGoogleFlow(baseUrl, mockGoogleState, {
      email: newGoogleEmail,
      emailVerified: true,
      name: 'Google Signup User',
      picture: 'https://example.com/google-signup-user.png',
      sub: `google-signup-${timestamp}`,
    });
    assert.equal(repeatLoginResult.status, 200);
    assert.equal(repeatLoginResult.body.user.id, signupResult.body.user.id);
    assert.equal(
      await AuthIdentity.countDocuments({ provider: 'google', providerUserId: `google-signup-${timestamp}` }),
      1,
    );

    const localLinkedUser = await User.create({
      name: 'Link Target User',
      email: linkEmail,
      passwordHash: 'password123',
      authProviderSummary: ['local'],
    });
    await AuthIdentity.create({
      userId: localLinkedUser._id,
      provider: 'local',
      emailAtProvider: linkEmail,
      emailVerifiedAtProvider: false,
    });

    const linkingResult = await runGoogleFlow(baseUrl, mockGoogleState, {
      email: linkEmail,
      emailVerified: true,
      name: 'Google Link User',
      picture: 'https://example.com/google-link-user.png',
      sub: `google-link-${timestamp}`,
    });
    assert.equal(linkingResult.status, 200);
    assert.equal(linkingResult.body.user.id, localLinkedUser.id);
    const linkedUser = await User.findById(localLinkedUser._id);
    assert.ok(linkedUser?.emailVerifiedAt);
    assert.equal(linkedUser?.authProviderSummary.includes('google'), true);
    const linkedGoogleIdentity = await AuthIdentity.findOne({
      userId: localLinkedUser._id,
      provider: 'google',
    });
    assert.ok(linkedGoogleIdentity);
    assert.equal(linkedGoogleIdentity?.providerUserId, `google-link-${timestamp}`);

    const failedLinkLocalUser = await User.create({
      name: 'Failed Link User',
      email: failedLinkEmail,
      passwordHash: 'password123',
      authProviderSummary: ['local'],
    });
    await AuthIdentity.create({
      userId: failedLinkLocalUser._id,
      provider: 'local',
      emailAtProvider: failedLinkEmail,
      emailVerifiedAtProvider: false,
    });

    const failedLinkResult = await runGoogleFlow(baseUrl, mockGoogleState, {
      email: failedLinkEmail,
      emailVerified: false,
      name: 'Google Failed Link User',
      picture: 'https://example.com/google-failed-link-user.png',
      sub: `google-failed-link-${timestamp}`,
    });
    assert.equal(failedLinkResult.status, 400);
    assert.equal(failedLinkResult.body.error.code, 'OAUTH_LINK_FAILED');
    assert.equal(
      failedLinkResult.body.error.message,
      'Google account could not be linked securely.',
    );
    assert.equal(
      await AuthIdentity.countDocuments({
        userId: failedLinkLocalUser._id,
        provider: 'google',
      }),
      0,
    );

    console.log('verify:t88 passed');
  } finally {
    Object.assign(config.oauth.google, originalOauthConfig);

    await Promise.allSettled([
      AuthIdentity.deleteMany({ emailAtProvider: { $in: createdEmails } }),
      EmailVerificationToken.deleteMany({ email: { $in: createdEmails } }),
      User.find({ email: { $in: createdEmails } }).select('_id').then((users) =>
        RefreshSession.deleteMany({ userId: { $in: users.map((user) => user._id) } })),
      User.deleteMany({ email: { $in: createdEmails } }),
    ]);

    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        appServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
      new Promise<void>((resolve, reject) => {
        mockGoogleServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    ]);
    await disconnectDB();
  }
}

async function runGoogleFlow(
  baseUrl: string,
  mockGoogleState: ReturnType<typeof createMockGoogleState>,
  profile: MockGoogleProfile,
) {
  mockGoogleState.nextProfiles.push(profile);

  const startResponse = await fetch(`${baseUrl}/api/v1/auth/oauth/google/start`, {
    redirect: 'manual',
  });
  assert.equal(startResponse.status, 302);
  const oauthCookie = getCookieHeader(startResponse.headers.get('set-cookie'));
  assert.ok(oauthCookie);
  const authorizationLocation = startResponse.headers.get('location');
  assert.ok(authorizationLocation);

  const authorizeResponse = await fetch(authorizationLocation!, {
    redirect: 'manual',
  });
  assert.equal(authorizeResponse.status, 302);
  const callbackLocation = authorizeResponse.headers.get('location');
  assert.ok(callbackLocation);

  const callbackResponse = await fetch(callbackLocation!, {
    headers: {
      Accept: 'application/json',
      Cookie: oauthCookie,
    },
    redirect: 'manual',
  });
  const callbackJson = await callbackResponse.json();

  return {
    status: callbackResponse.status,
    body: callbackJson,
    refreshCookie: getCookieHeader(callbackResponse.headers.get('set-cookie')),
  };
}

function createMockGoogleState() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const keyId = `mock-google-key-${Date.now()}`;

  return {
    authorizationCodes: new Map<string, MockAuthorizationSession>(),
    discovery: {
      clientId: '',
      issuer: '',
      jwksUri: '',
      publicJwk: {
        ...publicJwk,
        alg: 'RS256',
        kid: keyId,
        use: 'sig',
      },
    },
    keys: {
      keyId,
      privateKey,
      publicJwk: {
        ...publicJwk,
        alg: 'RS256',
        kid: keyId,
        use: 'sig',
      },
    },
    nextProfiles: [] as MockGoogleProfile[],
  };
}

async function handleMockGoogleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ReturnType<typeof createMockGoogleState>,
) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && requestUrl.pathname === '/.well-known/openid-configuration') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      issuer: state.discovery.issuer,
      jwks_uri: state.discovery.jwksUri,
    }));
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/jwks') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [state.discovery.publicJwk] }));
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/authorize') {
    const nextProfile = state.nextProfiles.shift();
    if (!nextProfile) {
      res.statusCode = 500;
      res.end('No queued Google profile');
      return;
    }

    const redirectUri = requestUrl.searchParams.get('redirect_uri');
    const stateParam = requestUrl.searchParams.get('state');
    const nonce = requestUrl.searchParams.get('nonce');
    const codeChallenge = requestUrl.searchParams.get('code_challenge');
    const codeChallengeMethod = requestUrl.searchParams.get('code_challenge_method');
    const clientId = requestUrl.searchParams.get('client_id');

    if (
      !redirectUri
      || !stateParam
      || !nonce
      || !codeChallenge
      || codeChallengeMethod !== 'S256'
      || clientId !== state.discovery.clientId
    ) {
      res.statusCode = 400;
      res.end('Invalid OAuth authorize request');
      return;
    }

    const code = crypto.randomUUID();
    const accessToken = crypto.randomUUID();
    state.authorizationCodes.set(code, {
      accessToken,
      nonce,
      profile: nextProfile,
    });

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', stateParam);
    res.statusCode = 302;
    res.setHeader('Location', callbackUrl.toString());
    res.end();
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/token') {
    const body = await readRequestBody(req);
    const parsedBody = new URLSearchParams(body);
    const code = parsedBody.get('code') || '';
    const clientId = parsedBody.get('client_id') || '';
    const clientSecret = parsedBody.get('client_secret') || '';
    const grantType = parsedBody.get('grant_type') || '';
    const codeVerifier = parsedBody.get('code_verifier') || '';
    const session = state.authorizationCodes.get(code);

    if (
      !session
      || clientId !== state.discovery.clientId
      || clientSecret !== config.oauth.google.clientSecret
      || grantType !== 'authorization_code'
      || !codeVerifier
    ) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }

    const signedIdToken = signGoogleIdToken(state, session.profile, {
      aud: clientId,
      iss: state.discovery.issuer,
      nonce: session.nonce,
    });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      access_token: session.accessToken,
      expires_in: 3600,
      id_token: signedIdToken,
      token_type: 'Bearer',
    }));
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/userinfo') {
    const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const session = [...state.authorizationCodes.values()].find((candidate) => candidate.accessToken === accessToken);
    if (!session) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      sub: session.profile.sub,
      email: session.profile.email,
      email_verified: session.profile.emailVerified,
      name: session.profile.name,
      picture: session.profile.picture,
    }));
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
}

function signGoogleIdToken(
  state: ReturnType<typeof createMockGoogleState>,
  profile: MockGoogleProfile,
  input: { aud: string; iss: string; nonce: string },
) {
  const header = {
    alg: 'RS256',
    kid: state.keys.keyId,
    typ: 'JWT',
  };
  const payload = {
    aud: input.aud,
    email: profile.email,
    email_verified: profile.emailVerified,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: input.iss,
    name: profile.name,
    nonce: input.nonce,
    picture: profile.picture,
    sub: profile.sub,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    state.keys.privateKey,
  ).toString('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function getCookieHeader(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return '';
  }

  return setCookieHeader.split(';', 1)[0] ?? '';
}

async function readRequestBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
