import assert from 'node:assert/strict';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import User from '../src/modules/users/user.model.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const email = `verify-t83-${timestamp}@example.com`;
  const initialPassword = 'password123';
  const updatedPassword = 'password456';
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'T83 Verifier',
        email,
        password: initialPassword,
      }),
    });

    assert.equal(registerResponse.status, 201);
    const registerJson = await registerResponse.json();
    const userId = String(registerJson.user.id);
    const registerCookie = getCookieHeader(registerResponse.headers.get('set-cookie'));

    assert.ok(registerJson.accessToken);
    assert.ok(registerCookie);

    const createdUser = await User.findById(userId);
    assert.ok(createdUser);
    assert.equal(createdUser.email, email);
    assert.equal(createdUser.emailVerifiedAt, null);
    assert.deepEqual(createdUser.authProviderSummary, ['local']);
    assert.equal(createdUser.failedLoginCount, 0);
    assert.equal(createdUser.lockedUntil, null);
    assert.equal(createdUser.lastPasswordChangedAt, null);
    assert.ok(createdUser.passwordHash);
    assert.notEqual(createdUser.passwordHash, initialPassword);

    const localIdentity = await AuthIdentity.findOne({ userId, provider: 'local' });
    assert.ok(localIdentity);
    assert.equal(localIdentity.emailAtProvider, email);
    assert.equal(localIdentity.emailVerifiedAtProvider, false);

    const verificationToken = await EmailVerificationToken.create({
      userId,
      tokenHash: crypto.randomUUID(),
      email,
      purpose: 'EMAIL_VERIFY',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    assert.ok(verificationToken.id);

    const refreshSession = await RefreshSession.create({
      userId,
      tokenHash: crypto.randomUUID(),
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    assert.ok(refreshSession.id);

    const profileResponse = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${registerJson.accessToken}` },
    });
    assert.equal(profileResponse.status, 200);
    const profileJson = await profileResponse.json();
    assert.equal(String(profileJson._id), userId);
    assert.deepEqual(profileJson.authProviderSummary, ['local']);

    const updateProfileResponse = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${registerJson.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'T83 Updated Name' }),
    });
    assert.equal(updateProfileResponse.status, 200);
    const updatedProfileJson = await updateProfileResponse.json();
    assert.equal(updatedProfileJson.name, 'T83 Updated Name');

    const changePasswordResponse = await fetch(`${baseUrl}/api/v1/users/me/password`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${registerJson.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: updatedPassword,
      }),
    });
    assert.equal(changePasswordResponse.status, 200);
    const changePasswordJson = await changePasswordResponse.json();
    assert.equal(changePasswordJson.message, 'Password updated successfully');

    const passwordChangedUser = await User.findById(userId);
    assert.ok(passwordChangedUser?.lastPasswordChangedAt);

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: updatedPassword,
      }),
    });
    assert.equal(loginResponse.status, 200);
    const loginJson = await loginResponse.json();
    const loginCookie = getCookieHeader(loginResponse.headers.get('set-cookie'));
    assert.ok(loginJson.accessToken);
    assert.ok(loginCookie);

    const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: loginCookie },
    });
    assert.equal(refreshResponse.status, 200);
    const refreshJson = await refreshResponse.json();
    assert.ok(refreshJson.accessToken);

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginJson.accessToken}`,
        Cookie: loginCookie,
      },
    });
    assert.equal(logoutResponse.status, 200);
    const logoutJson = await logoutResponse.json();
    assert.equal(logoutJson.message, 'Logged out successfully');

    console.log('verify:t83 passed');
  } finally {
    await Promise.allSettled([
      AuthIdentity.deleteMany({ emailAtProvider: email }),
      EmailVerificationToken.deleteMany({ email }),
      RefreshSession.deleteMany({ userId: { $in: await getUserIdsByEmail(email) } }),
      User.deleteMany({ email }),
    ]);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await disconnectDB();
  }
}

function getCookieHeader(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return '';
  }

  return setCookieHeader.split(';', 1)[0] ?? '';
}

async function getUserIdsByEmail(email: string) {
  const users = await User.find({ email }).select('_id');
  return users.map((user) => user._id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
