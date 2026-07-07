import assert from 'node:assert/strict';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import User from '../src/modules/users/user.model.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const email = `verify-t84-${timestamp}@example.com`;
  const password = 'password123';
  const adminEmail = `verify-t84-admin-${timestamp}@example.com`;
  let userId = '';
  let adminUserId = '';
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
        name: 'T84 User',
        email,
        password,
      }),
    });

    assert.equal(registerResponse.status, 201);
    const registerJson = await registerResponse.json();
    userId = String(registerJson.user.id);
    const firstCookie = getCookieHeader(registerResponse.headers.get('set-cookie'));
    assert.ok(firstCookie);

    let sessions = await RefreshSession.find({ userId }).sort({ createdAt: 1 });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].revokedAt, null);
    assert.ok(sessions[0].familyId);

    const rotatedResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    const rotatedJson = await rotatedResponse.json();
    assert.equal(rotatedResponse.status, 200, JSON.stringify(rotatedJson));
    assert.ok(rotatedJson.accessToken);
    const rotatedCookie = getCookieHeader(rotatedResponse.headers.get('set-cookie'));
    assert.ok(rotatedCookie);

    sessions = await RefreshSession.find({ userId }).sort({ createdAt: 1 });
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].familyId, sessions[1].familyId);
    assert.ok(sessions[0].revokedAt);
    assert.equal(sessions[0].revokedReason, 'ROTATED');
    assert.equal(String(sessions[0].replacedBySessionId), String(sessions[1]._id));
    assert.equal(sessions[1].revokedAt, null);

    const reusedOldResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: firstCookie },
    });
    assert.equal(reusedOldResponse.status, 401);

    sessions = await RefreshSession.find({ userId }).sort({ createdAt: 1 });
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].revokedReason, 'ROTATED');
    assert.ok(sessions[1].revokedAt);
    assert.equal(sessions[1].revokedReason, 'REUSED');

    const revokedFamilyResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: rotatedCookie },
    });
    assert.equal(revokedFamilyResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginResponse.status, 200);
    const loginJson = await loginResponse.json();
    const loginCookie = getCookieHeader(loginResponse.headers.get('set-cookie'));
    assert.ok(loginCookie);

    let currentSession = await RefreshSession.findOne({
      userId,
      revokedAt: null,
    }).sort({ createdAt: -1 });
    assert.ok(currentSession);

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginJson.accessToken}`,
        Cookie: loginCookie,
      },
    });
    assert.equal(logoutResponse.status, 200);

    currentSession = await RefreshSession.findById(currentSession!._id);
    assert.ok(currentSession?.revokedAt);
    assert.equal(currentSession?.revokedReason, 'LOGOUT');

    const secondLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(secondLoginResponse.status, 200);
    const secondLoginJson = await secondLoginResponse.json();
    const secondLoginCookie = getCookieHeader(secondLoginResponse.headers.get('set-cookie'));
    assert.ok(secondLoginCookie);

    const adminUser = await User.create({
      name: 'T84 Admin',
      email: adminEmail,
      passwordHash: 'password123',
      role: 'ADMIN',
      authProviderSummary: ['local'],
    });
    adminUserId = adminUser.id;
    await AuthIdentity.create({
      userId: adminUser._id,
      provider: 'local',
      emailAtProvider: adminUser.email,
      emailVerifiedAtProvider: false,
    });
    const adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });

    const disableResponse = await fetch(`${baseUrl}/api/v1/admin/users/${userId}/disable`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ disabled: true }),
    });
    assert.equal(disableResponse.status, 200);

    const activeSessionsAfterDisable = await RefreshSession.find({
      userId,
      revokedAt: null,
    });
    assert.equal(activeSessionsAfterDisable.length, 0);
    const disabledRevokedSession = await RefreshSession.findOne({
      userId,
      revokedReason: 'ACCOUNT_DISABLED',
    });
    assert.ok(disabledRevokedSession);

    const disabledRefreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: secondLoginCookie },
    });
    assert.equal(disabledRefreshResponse.status, 401);

    console.log('verify:t84 passed');
  } finally {
    await Promise.allSettled([
      AuthIdentity.deleteMany({ emailAtProvider: { $in: [email, adminEmail] } }),
      EmailVerificationToken.deleteMany({ email: { $in: [email, adminEmail] } }),
      RefreshSession.deleteMany({ userId: { $in: [userId, adminUserId].filter(Boolean) } }),
      User.deleteMany({ email: { $in: [email, adminEmail] } }),
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
