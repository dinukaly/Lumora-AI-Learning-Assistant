import assert from 'node:assert/strict';
import crypto from 'crypto';
import app from '../src/app.js';
import { EmailService } from '../src/common/email/index.js';
import { config } from '../src/config/index.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';
import User from '../src/modules/users/user.model.js';

type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const primaryEmail = `verify-t85-${timestamp}@example.com`;
  const expiredEmail = `verify-t85-expired-${timestamp}@example.com`;
  const password = 'password123';
  const originalCooldownSeconds = config.email.verificationResendCooldownSeconds;
  const capturedEmails: CapturedEmail[] = [];
  let primaryUserId = '';
  let expiredUserId = '';
  const server = app.listen(0);

  EmailService.setProviderForTesting({
    async send(input) {
      capturedEmails.push({
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      return {
        provider: 'console',
        messageId: `test-${capturedEmails.length}`,
      };
    },
  });

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
        name: 'T85 User',
        email: primaryEmail,
        password,
      }),
    });
    assert.equal(registerResponse.status, 201);
    const registerJson = await registerResponse.json();
    primaryUserId = String(registerJson.user.id);
    assert.equal(registerJson.emailVerificationRequired, true);
    assert.equal(registerJson.verificationEmailSent, true);
    assert.equal(
      registerJson.message,
      'Account created. Verify your email to unlock protected features.',
    );
    assert.equal(capturedEmails.length, 1);

    let primaryTokenRecord = await EmailVerificationToken.findOne({
      userId: primaryUserId,
      purpose: 'EMAIL_VERIFY',
      consumedAt: null,
    }).sort({ createdAt: -1 });
    assert.ok(primaryTokenRecord);

    const firstToken = extractTokenFromEmail(capturedEmails[0]);

    const immediateResendResponse = await fetch(`${baseUrl}/api/v1/auth/verification/resend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerJson.accessToken}`,
      },
    });
    assert.equal(immediateResendResponse.status, 200);
    assert.equal(capturedEmails.length, 1);
    let tokenCount = await EmailVerificationToken.countDocuments({
      userId: primaryUserId,
      purpose: 'EMAIL_VERIFY',
      consumedAt: null,
    });
    assert.equal(tokenCount, 1);

    config.email.verificationResendCooldownSeconds = 0;
    const resendResponse = await fetch(`${baseUrl}/api/v1/auth/verification/resend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerJson.accessToken}`,
      },
    });
    assert.equal(resendResponse.status, 200);
    assert.equal(capturedEmails.length, 2);

    primaryTokenRecord = await EmailVerificationToken.findOne({
      userId: primaryUserId,
      purpose: 'EMAIL_VERIFY',
      consumedAt: null,
    }).sort({ createdAt: -1 });
    assert.ok(primaryTokenRecord);
    tokenCount = await EmailVerificationToken.countDocuments({
      userId: primaryUserId,
      purpose: 'EMAIL_VERIFY',
      consumedAt: null,
    });
    assert.equal(tokenCount, 1);

    const replacementToken = extractTokenFromEmail(capturedEmails[1]);
    assert.notEqual(replacementToken, firstToken);

    const invalidatedOldTokenResponse = await fetch(
      `${baseUrl}/api/v1/auth/verification/verify?token=${encodeURIComponent(firstToken)}`,
    );
    assert.equal(invalidatedOldTokenResponse.status, 400);
    const invalidatedOldTokenJson = await invalidatedOldTokenResponse.json();
    assert.equal(invalidatedOldTokenJson.error.code, 'TOKEN_EXPIRED');
    assert.equal(
      invalidatedOldTokenJson.error.message,
      'Verification token is invalid or has expired',
    );

    const verifyResponse = await fetch(
      `${baseUrl}/api/v1/auth/verification/verify?token=${encodeURIComponent(replacementToken)}`,
    );
    assert.equal(verifyResponse.status, 200);
    const verifyJson = await verifyResponse.json();
    assert.equal(verifyJson.message, 'Email verified successfully');

    const verifiedUser = await User.findById(primaryUserId);
    assert.ok(verifiedUser?.emailVerifiedAt);

    const localIdentity = await AuthIdentity.findOne({
      userId: primaryUserId,
      provider: 'local',
    });
    assert.ok(localIdentity);
    assert.equal(localIdentity?.emailVerifiedAtProvider, true);

    const consumedToken = await EmailVerificationToken.findById(primaryTokenRecord._id);
    assert.ok(consumedToken?.consumedAt);

    const reusedTokenResponse = await fetch(
      `${baseUrl}/api/v1/auth/verification/verify?token=${encodeURIComponent(replacementToken)}`,
    );
    assert.equal(reusedTokenResponse.status, 400);
    const reusedTokenJson = await reusedTokenResponse.json();
    assert.equal(reusedTokenJson.error.code, 'TOKEN_EXPIRED');

    const postVerifyResendResponse = await fetch(`${baseUrl}/api/v1/auth/verification/resend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerJson.accessToken}`,
      },
    });
    assert.equal(postVerifyResendResponse.status, 200);
    assert.equal(capturedEmails.length, 2);

    const expiredRegisterResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'T85 Expired User',
        email: expiredEmail,
        password,
      }),
    });
    assert.equal(expiredRegisterResponse.status, 201);
    const expiredRegisterJson = await expiredRegisterResponse.json();
    expiredUserId = String(expiredRegisterJson.user.id);
    assert.equal(capturedEmails.length, 3);

    const expiredToken = extractTokenFromEmail(capturedEmails[2]);
    const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
    await EmailVerificationToken.updateOne(
      { tokenHash: expiredTokenHash },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const expiredVerifyResponse = await fetch(
      `${baseUrl}/api/v1/auth/verification/verify?token=${encodeURIComponent(expiredToken)}`,
    );
    assert.equal(expiredVerifyResponse.status, 400);
    const expiredVerifyJson = await expiredVerifyResponse.json();
    assert.equal(expiredVerifyJson.error.code, 'TOKEN_EXPIRED');
    assert.equal(
      expiredVerifyJson.error.message,
      'Verification token is invalid or has expired',
    );

    console.log('verify:t85 passed');
  } finally {
    config.email.verificationResendCooldownSeconds = originalCooldownSeconds;
    EmailService.resetProviderForTesting();

    await Promise.allSettled([
      AuthIdentity.deleteMany({ emailAtProvider: { $in: [primaryEmail, expiredEmail] } }),
      EmailVerificationToken.deleteMany({ email: { $in: [primaryEmail, expiredEmail] } }),
      RefreshSession.deleteMany({
        userId: { $in: [primaryUserId, expiredUserId].filter(Boolean) },
      }),
      User.deleteMany({ email: { $in: [primaryEmail, expiredEmail] } }),
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

function extractTokenFromEmail(email: CapturedEmail) {
  const match = email.text.match(/https?:\/\/\S+\?token=([a-f0-9]+)/i);
  assert.ok(match?.[1], 'Verification token link not found in email body');
  return match[1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
