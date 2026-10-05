import assert from 'node:assert/strict';
import app from '../src/app.js';
import { EmailService } from '../src/common/email/index.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { config } from '../src/config/index.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const email = `verify-t87-${timestamp}@example.com`;
  const unknownEmail = `verify-t87-unknown-${timestamp}@example.com`;
  const password = 'password123';
  let userId = '';
  const originalWindowMs = config.rateLimit.loginProtectionWindowMs;
  const originalMaxAttempts = config.rateLimit.loginProtectionMaxAttempts;
  const originalLockoutMs = config.rateLimit.loginProtectionLockoutMs;
  const server = app.listen(0);

  EmailService.setProviderForTesting({
    async send() {
      return {
        provider: 'console',
        messageId: `test-${timestamp}`,
      };
    },
  });

  config.rateLimit.loginProtectionWindowMs = 60_000;
  config.rateLimit.loginProtectionMaxAttempts = 5;
  config.rateLimit.loginProtectionLockoutMs = 1_000;

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
        name: 'T87 User',
        email,
        password,
      }),
    });
    assert.equal(registerResponse.status, 201);
    const registerJson = await registerResponse.json();
    userId = String(registerJson.user.id);

    const unknownLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: unknownEmail,
        password,
      }),
    });
    assert.equal(unknownLoginResponse.status, 401);
    const unknownLoginJson = await unknownLoginResponse.json();
    assert.equal(unknownLoginJson.error.code, 'UNAUTHORIZED');
    assert.equal(unknownLoginJson.error.message, 'Invalid credentials');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'wrong-password',
        }),
      });

      assert.equal(response.status, 401);
      const responseJson = await response.json();
      assert.equal(responseJson.error.code, 'UNAUTHORIZED');
      assert.equal(responseJson.error.message, 'Invalid credentials');
    }

    const lockedResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'wrong-password',
      }),
    });
    assert.equal(lockedResponse.status, 429);
    const lockedJson = await lockedResponse.json();
    assert.equal(lockedJson.error.code, 'RATE_LIMITED');
    assert.equal(lockedJson.error.message, 'Too many attempts. Please wait and try again.');

    let protectedUser = await User.findById(userId);
    assert.ok(protectedUser);
    assert.equal(protectedUser?.failedLoginCount, 5);
    assert.ok(protectedUser?.lastFailedLoginAt);
    assert.ok(protectedUser?.lockedUntil);

    const lockedCorrectPasswordResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
      }),
    });
    assert.equal(lockedCorrectPasswordResponse.status, 429);
    const lockedCorrectPasswordJson = await lockedCorrectPasswordResponse.json();
    assert.equal(lockedCorrectPasswordJson.error.code, 'RATE_LIMITED');
    assert.equal(
      lockedCorrectPasswordJson.error.message,
      'Too many attempts. Please wait and try again.',
    );

    await new Promise((resolve) => setTimeout(resolve, config.rateLimit.loginProtectionLockoutMs + 250));

    const successfulLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
      }),
    });
    assert.equal(successfulLoginResponse.status, 200);
    const successfulLoginJson = await successfulLoginResponse.json();
    assert.ok(successfulLoginJson.accessToken);

    protectedUser = await User.findById(userId);
    assert.ok(protectedUser);
    assert.equal(protectedUser?.failedLoginCount, 0);
    assert.equal(protectedUser?.lastFailedLoginAt, null);
    assert.equal(protectedUser?.lockedUntil, null);
    assert.ok(protectedUser?.lastLoginAt);

    console.log('verify:t87 passed');
  } finally {
    config.rateLimit.loginProtectionWindowMs = originalWindowMs;
    config.rateLimit.loginProtectionMaxAttempts = originalMaxAttempts;
    config.rateLimit.loginProtectionLockoutMs = originalLockoutMs;
    EmailService.resetProviderForTesting();

    await Promise.allSettled([
      AuthIdentity.deleteMany({ emailAtProvider: email }),
      EmailVerificationToken.deleteMany({ email }),
      RefreshSession.deleteMany({ userId: { $in: [userId].filter(Boolean) } }),
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
