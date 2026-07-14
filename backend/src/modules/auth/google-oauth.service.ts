import crypto from 'crypto';
import { createPublicKey, verify as verifySignature } from 'crypto';
import type { Response } from 'express';
import { config } from '../../config/index.js';
import { generateAccessToken, generateRefreshToken } from '../../common/utils/jwt.js';
import User from '../users/user.model.js';
import AuthIdentity from './auth-identity.model.js';
import { RefreshSessionService, type RefreshSessionContext } from './refresh-session.service.js';

const GOOGLE_OAUTH_COOKIE_NAME = 'googleOAuthState';
const GOOGLE_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax' as const,
  maxAge: config.oauth.google.stateTtlMs,
};

type GoogleOAuthStateCookiePayload = {
  createdAtMs: number;
  nonce: string;
  state: string;
  verifier: string;
};

type MobileGoogleOAuthStatePayload = {
  callbackUrl: string;
  createdAtMs: number;
  mode: 'mobile';
  nonce: string;
  verifier: string;
};

type GoogleDiscoveryDocument = {
  issuer: string;
  jwks_uri: string;
};

type GoogleJwk = {
  alg?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
};

type GoogleJwksResponse = {
  keys: GoogleJwk[];
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  id_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleIdTokenPayload = {
  aud?: string | string[];
  email?: string;
  email_verified?: boolean;
  exp?: number;
  iat?: number;
  iss?: string;
  name?: string;
  nonce?: string;
  picture?: string;
  sub?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub?: string;
};

type GoogleResolvedProfile = {
  email: string;
  emailVerified: true;
  name: string;
  picture?: string;
  providerUserId: string;
};

type IssuedSocialSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
    emailVerifiedAt: string | null;
  };
};

let discoveryCache:
  | {
      expiresAtMs: number;
      value: GoogleDiscoveryDocument;
    }
  | null = null;

let jwksCache:
  | {
      expiresAtMs: number;
      value: GoogleJwksResponse;
    }
  | null = null;

export class GoogleOAuthError extends Error {
  constructor(
    readonly code:
      | 'OAUTH_DISABLED'
      | 'OAUTH_INVALID_STATE'
      | 'OAUTH_PROVIDER_ERROR'
      | 'OAUTH_LINK_FAILED',
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

export class GoogleOAuthService {
  static isEnabled() {
    return config.oauth.google.enabled;
  }

  static createAuthorizationUrl() {
    assertGoogleOauthConfigured();

    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = toBase64Url(crypto.createHash('sha256').update(verifier).digest());
    const authorizationUrl = new URL(config.oauth.google.authorizationUrl);

    authorizationUrl.searchParams.set('client_id', config.oauth.google.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.oauth.google.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', config.oauth.google.scopes.join(' '));
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    return {
      authorizationUrl: authorizationUrl.toString(),
      cookieValue: encodeOauthCookie({
        createdAtMs: Date.now(),
        nonce,
        state,
        verifier,
      }),
    };
  }

  static createMobileAuthorizationUrl(input: { callbackUrl: string }) {
    assertGoogleOauthConfigured();
    assertValidMobileCallbackUrl(input.callbackUrl);

    const nonce = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = toBase64Url(crypto.createHash('sha256').update(verifier).digest());
    const authorizationUrl = new URL(config.oauth.google.authorizationUrl);
    const encodedState = encodeMobileOauthState({
      callbackUrl: input.callbackUrl,
      createdAtMs: Date.now(),
      mode: 'mobile',
      nonce,
      verifier,
    });

    authorizationUrl.searchParams.set('client_id', config.oauth.google.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.oauth.google.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', config.oauth.google.scopes.join(' '));
    authorizationUrl.searchParams.set('state', encodedState);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    return {
      authorizationUrl: authorizationUrl.toString(),
    };
  }

  static getMobileCallbackUrl(state?: string | null) {
    return decodeMobileOauthState(state)?.callbackUrl ?? null;
  }

  static applyOauthCookie(res: Response, cookieValue: string) {
    res.cookie(GOOGLE_OAUTH_COOKIE_NAME, cookieValue, GOOGLE_OAUTH_COOKIE_OPTIONS);
  }

  static clearOauthCookie(res: Response) {
    res.clearCookie(GOOGLE_OAUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax' as const,
    });
  }

  static async completeAuthorization(input: {
    code: string;
    cookieValue?: string | null;
    state: string;
    context?: RefreshSessionContext;
  }): Promise<IssuedSocialSession> {
    assertGoogleOauthConfigured();

    const oauthState = decodeOauthCookie(input.cookieValue);
    if (!oauthState || oauthState.state !== input.state) {
      throw new GoogleOAuthError(
        'OAUTH_INVALID_STATE',
        'Google sign-in could not be completed safely. Please try again.',
        400,
      );
    }

    if (Date.now() - oauthState.createdAtMs > config.oauth.google.stateTtlMs) {
      throw new GoogleOAuthError(
        'OAUTH_INVALID_STATE',
        'Google sign-in could not be completed safely. Please try again.',
        400,
      );
    }

    const tokenResponse = await exchangeAuthorizationCode({
      code: input.code,
      verifier: oauthState.verifier,
    });
    const idTokenPayload = await verifyGoogleIdToken(tokenResponse.id_token, oauthState.nonce);
    const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
    const profile = resolveGoogleProfile(idTokenPayload, userInfo);
    const user = await findOrCreateUserForGoogleProfile(profile);
    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await RefreshSessionService.createSession({
      userId: user._id,
      refreshToken,
      ...input.context,
    });

    return {
      user: mapAuthUser(user),
      accessToken,
      refreshToken,
    };
  }

  static async completeMobileAuthorization(input: {
    code: string;
    state: string;
    context?: RefreshSessionContext;
  }): Promise<IssuedSocialSession> {
    assertGoogleOauthConfigured();

    const oauthState = decodeMobileOauthState(input.state);
    if (!oauthState) {
      throw new GoogleOAuthError(
        'OAUTH_INVALID_STATE',
        'Google sign-in could not be completed safely. Please try again.',
        400,
      );
    }

    if (Date.now() - oauthState.createdAtMs > config.oauth.google.stateTtlMs) {
      throw new GoogleOAuthError(
        'OAUTH_INVALID_STATE',
        'Google sign-in could not be completed safely. Please try again.',
        400,
      );
    }

    const tokenResponse = await exchangeAuthorizationCode({
      code: input.code,
      verifier: oauthState.verifier,
    });
    const idTokenPayload = await verifyGoogleIdToken(tokenResponse.id_token, oauthState.nonce);
    const userInfo = await fetchGoogleUserInfo(tokenResponse.access_token);
    const profile = resolveGoogleProfile(idTokenPayload, userInfo);
    const user = await findOrCreateUserForGoogleProfile(profile);
    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await RefreshSessionService.createSession({
      userId: user._id,
      refreshToken,
      ...input.context,
    });

    return {
      user: mapAuthUser(user),
      accessToken,
      refreshToken,
    };
  }
}

function assertGoogleOauthConfigured() {
  if (
    !config.oauth.google.enabled
    || !config.oauth.google.clientId
    || !config.oauth.google.clientSecret
    || !config.oauth.google.redirectUri
  ) {
    throw new GoogleOAuthError(
      'OAUTH_DISABLED',
      'Google sign-in is not available.',
      503,
    );
  }
}

function encodeOauthCookie(payload: GoogleOAuthStateCookiePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signOauthCookiePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeOauthCookie(cookieValue?: string | null): GoogleOAuthStateCookiePayload | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const [encodedPayload, signature] = cookieValue.split('.');
    if (!encodedPayload || !signature || !isOauthCookieSignatureValid(encodedPayload, signature)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<GoogleOAuthStateCookiePayload>;
    if (
      typeof parsed.state !== 'string'
      || typeof parsed.nonce !== 'string'
      || typeof parsed.verifier !== 'string'
      || typeof parsed.createdAtMs !== 'number'
    ) {
      return null;
    }

    return {
      createdAtMs: parsed.createdAtMs,
      nonce: parsed.nonce,
      state: parsed.state,
      verifier: parsed.verifier,
    };
  } catch {
    return null;
  }
}

function encodeMobileOauthState(payload: MobileGoogleOAuthStatePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signOauthCookiePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeMobileOauthState(state?: string | null): MobileGoogleOAuthStatePayload | null {
  if (!state) {
    return null;
  }

  try {
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature || !isOauthCookieSignatureValid(encodedPayload, signature)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<MobileGoogleOAuthStatePayload>;

    if (
      parsed.mode !== 'mobile'
      || typeof parsed.callbackUrl !== 'string'
      || typeof parsed.createdAtMs !== 'number'
      || typeof parsed.nonce !== 'string'
      || typeof parsed.verifier !== 'string'
    ) {
      return null;
    }

    assertValidMobileCallbackUrl(parsed.callbackUrl);

    return {
      callbackUrl: parsed.callbackUrl,
      createdAtMs: parsed.createdAtMs,
      mode: 'mobile',
      nonce: parsed.nonce,
      verifier: parsed.verifier,
    };
  } catch {
    return null;
  }
}

function signOauthCookiePayload(encodedPayload: string) {
  return crypto
    .createHmac('sha256', config.jwt.refreshSecret)
    .update(encodedPayload)
    .digest('base64url');
}

function isOauthCookieSignatureValid(encodedPayload: string, signature: string) {
  const expectedSignature = signOauthCookiePayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function exchangeAuthorizationCode(input: { code: string; verifier: string }) {
  const body = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    client_secret: config.oauth.google.clientSecret,
    code: input.code,
    code_verifier: input.verifier,
    grant_type: 'authorization_code',
    redirect_uri: config.oauth.google.redirectUri,
  });

  const response = await fetch(config.oauth.google.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      502,
    );
  }

  const tokenResponse = await response.json() as GoogleTokenResponse;
  if (!tokenResponse.id_token || !tokenResponse.access_token) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      502,
    );
  }

  return tokenResponse;
}

async function verifyGoogleIdToken(idToken: string, expectedNonce: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      400,
    );
  }

  const header = parseJsonBase64Url<{ alg?: string; kid?: string; typ?: string }>(encodedHeader);
  const payload = parseJsonBase64Url<GoogleIdTokenPayload>(encodedPayload);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      400,
    );
  }

  const discoveryDocument = await getDiscoveryDocument();
  const jwk = await getGoogleJwk(header.kid);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    fromBase64Url(encodedSignature),
  );

  const issuerMatches = payload.iss === discoveryDocument.issuer
    || payload.iss === 'https://accounts.google.com'
    || payload.iss === 'accounts.google.com';
  const audienceMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(config.oauth.google.clientId)
    : payload.aud === config.oauth.google.clientId;
  const expired = !payload.exp || payload.exp * 1000 <= Date.now();

  if (
    !verified
    || !issuerMatches
    || !audienceMatches
    || expired
    || payload.nonce !== expectedNonce
    || typeof payload.sub !== 'string'
  ) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      400,
    );
  }

  return payload;
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(config.oauth.google.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      502,
    );
  }

  return response.json() as Promise<GoogleUserInfo>;
}

function resolveGoogleProfile(idTokenPayload: GoogleIdTokenPayload, userInfo: GoogleUserInfo): GoogleResolvedProfile {
  const idTokenEmail = normalizeEmail(idTokenPayload.email);
  const userInfoEmail = normalizeEmail(userInfo.email);
  const providerUserId = idTokenPayload.sub;
  const emailVerified = Boolean(idTokenPayload.email_verified) && Boolean(userInfo.email_verified);
  const emailsMatch = Boolean(idTokenEmail) && idTokenEmail === userInfoEmail;

  if (!providerUserId || !idTokenEmail || !emailsMatch || !emailVerified) {
    throw new GoogleOAuthError(
      'OAUTH_LINK_FAILED',
      'Google account could not be linked securely.',
      400,
    );
  }

  return {
    providerUserId,
    email: idTokenEmail,
    emailVerified: true,
    name: userInfo.name?.trim() || idTokenPayload.name?.trim() || idTokenEmail.split('@')[0],
    picture: userInfo.picture || idTokenPayload.picture,
  };
}

async function findOrCreateUserForGoogleProfile(profile: GoogleResolvedProfile) {
  const now = new Date();
  const existingIdentity = await AuthIdentity.findOne({
    provider: 'google',
    providerUserId: profile.providerUserId,
  });

  if (existingIdentity) {
    const existingUser = await User.findById(existingIdentity.userId);
    if (!existingUser) {
      throw new GoogleOAuthError(
        'OAUTH_LINK_FAILED',
        'Google account could not be linked securely.',
        400,
      );
    }

    if (existingUser.disabledAt) {
      throw new GoogleOAuthError('OAUTH_LINK_FAILED', 'Account is disabled', 403);
    }

    existingIdentity.emailAtProvider = profile.email;
    existingIdentity.emailVerifiedAtProvider = true;
    await existingIdentity.save();

    existingUser.emailVerifiedAt = existingUser.emailVerifiedAt ?? now;
    existingUser.authProviderSummary = appendProviderSummary(existingUser.authProviderSummary, 'google');
    await existingUser.save();

    return existingUser;
  }

  const existingUser = await User.findOne({ email: profile.email });
  if (existingUser) {
    if (existingUser.disabledAt) {
      throw new GoogleOAuthError('OAUTH_LINK_FAILED', 'Account is disabled', 403);
    }

    await AuthIdentity.create({
      userId: existingUser._id,
      provider: 'google',
      providerUserId: profile.providerUserId,
      emailAtProvider: profile.email,
      emailVerifiedAtProvider: true,
    });
    existingUser.emailVerifiedAt = existingUser.emailVerifiedAt ?? now;
    existingUser.authProviderSummary = appendProviderSummary(existingUser.authProviderSummary, 'google');
    await existingUser.save();

    return existingUser;
  }

  const user = await User.create({
    name: profile.name,
    email: profile.email,
    avatar: profile.picture,
    authProviderSummary: ['google'],
    emailVerifiedAt: now,
  });
  await AuthIdentity.create({
    userId: user._id,
    provider: 'google',
    providerUserId: profile.providerUserId,
    emailAtProvider: profile.email,
    emailVerifiedAtProvider: true,
  });

  return user;
}

function appendProviderSummary(
  currentProviders: Array<'local' | 'google' | 'apple'>,
  nextProvider: 'google',
) {
  if (currentProviders.includes(nextProvider)) {
    return currentProviders;
  }

  return [...currentProviders, nextProvider];
}

async function getDiscoveryDocument() {
  if (discoveryCache && discoveryCache.expiresAtMs > Date.now()) {
    return discoveryCache.value;
  }

  const response = await fetch(config.oauth.google.discoveryUrl);
  if (!response.ok) {
    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      502,
    );
  }

  const discoveryDocument = await response.json() as GoogleDiscoveryDocument;
  discoveryCache = {
    value: discoveryDocument,
    expiresAtMs: Date.now() + parseMaxAgeMs(response.headers.get('cache-control') ?? null, 60 * 60 * 1000),
  };

  return discoveryDocument;
}

async function getGoogleJwk(kid: string, allowRefresh = true): Promise<GoogleJwk> {
  if (!jwksCache || jwksCache.expiresAtMs <= Date.now()) {
    const discoveryDocument = await getDiscoveryDocument();
    const response = await fetch(discoveryDocument.jwks_uri);
    if (!response.ok) {
      throw new GoogleOAuthError(
        'OAUTH_PROVIDER_ERROR',
        'Google sign-in could not be completed. Please try again.',
        502,
      );
    }

    const jwks = await response.json() as GoogleJwksResponse;
    jwksCache = {
      value: jwks,
      expiresAtMs: Date.now() + parseMaxAgeMs(response.headers.get('cache-control') ?? null, 60 * 60 * 1000),
    };
  }

  const jwk = jwksCache.value.keys.find((candidate) => candidate.kid === kid);
  if (!jwk) {
    if (allowRefresh) {
      jwksCache = null;
      return getGoogleJwk(kid, false);
    }

    throw new GoogleOAuthError(
      'OAUTH_PROVIDER_ERROR',
      'Google sign-in could not be completed. Please try again.',
      400,
    );
  }

  return jwk;
}

function parseJsonBase64Url<T>(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function toBase64Url(value: Buffer) {
  return value.toString('base64url');
}

function randomBase64Url(size: number) {
  return crypto.randomBytes(size).toString('base64url');
}

function assertValidMobileCallbackUrl(callbackUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(callbackUrl);
  } catch {
    throw new GoogleOAuthError(
      'OAUTH_INVALID_STATE',
      'Google sign-in could not be completed safely. Please try again.',
      400,
    );
  }

  if (parsedUrl.protocol !== 'lumora:') {
    throw new GoogleOAuthError(
      'OAUTH_INVALID_STATE',
      'Google sign-in could not be completed safely. Please try again.',
      400,
    );
  }
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() || '';
}

function parseMaxAgeMs(cacheControlHeader: string | null, fallbackMs: number) {
  if (!cacheControlHeader) {
    return fallbackMs;
  }

  const match = cacheControlHeader.match(/max-age=(\d+)/i);
  if (!match) {
    return fallbackMs;
  }

  return Number(match[1]) * 1000;
}

function mapAuthUser(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  passwordHash?: string;
  authProviderSummary?: Array<'local' | 'google' | 'apple'>;
  emailVerifiedAt?: Date | null;
}) {
  const authProviders = Array.isArray(user.authProviderSummary) && user.authProviderSummary.length > 0
    ? [...new Set(user.authProviderSummary)]
    : user.passwordHash
      ? ['local']
      : [];

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    authProviders,
    hasPassword: Boolean(user.passwordHash),
  };
}
