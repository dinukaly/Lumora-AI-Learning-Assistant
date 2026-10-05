import assert from 'node:assert/strict';
import app from '../src/app.js';
import { EmailService } from '../src/common/email/index.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import AuthIdentity from '../src/modules/auth/auth-identity.model.js';
import EmailVerificationToken from '../src/modules/auth/email-verification-token.model.js';
import RefreshSession from '../src/modules/auth/refresh-session.model.js';
import User from '../src/modules/users/user.model.js';

type CapturedEmail = {
  text: string;
};

async function main() {
  await connectDB();

  const timestamp = Date.now();
  const email = `verify-t86-${timestamp}@example.com`;
  const password = 'password123';
  const capturedEmails: CapturedEmail[] = [];
  let userId = '';
  const server = app.listen(0);

  EmailService.setProviderForTesting({
    async send(input) {
      capturedEmails.push({ text: input.text });
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
        name: 'T86 User',
        email,
        password,
      }),
    });
    assert.equal(registerResponse.status, 201);
    const registerJson = await registerResponse.json();
    userId = String(registerJson.user.id);
    const authHeaders = {
      Authorization: `Bearer ${registerJson.accessToken}`,
    };

    const profileResponse = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: authHeaders,
    });
    assert.equal(profileResponse.status, 200);

    const resendResponse = await fetch(`${baseUrl}/api/v1/auth/verification/resend`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(resendResponse.status, 200);

    const progressResponse = await fetch(`${baseUrl}/api/v1/learning/progress`, {
      headers: authHeaders,
    });
    assert.equal(progressResponse.status, 200);

    const documentsResponse = await fetch(`${baseUrl}/api/v1/documents`, {
      headers: authHeaders,
    });
    assert.equal(documentsResponse.status, 403);
    const documentsJson = await documentsResponse.json();
    assert.equal(documentsJson.error.code, 'EMAIL_UNVERIFIED');

    const flashcardsResponse = await fetch(`${baseUrl}/api/v1/learning/flashcards`, {
      headers: authHeaders,
    });
    assert.equal(flashcardsResponse.status, 403);
    const flashcardsJson = await flashcardsResponse.json();
    assert.equal(flashcardsJson.error.code, 'EMAIL_UNVERIFIED');

    const aiActionsResponse = await fetch(`${baseUrl}/api/v1/ai/actions/latest?documentId=test-doc`, {
      headers: authHeaders,
    });
    assert.equal(aiActionsResponse.status, 403);
    const aiActionsJson = await aiActionsResponse.json();
    assert.equal(aiActionsJson.error.code, 'EMAIL_UNVERIFIED');

    const conversationsResponse = await fetch(`${baseUrl}/api/v1/conversations`, {
      headers: authHeaders,
    });
    assert.equal(conversationsResponse.status, 403);
    const conversationsJson = await conversationsResponse.json();
    assert.equal(conversationsJson.error.code, 'EMAIL_UNVERIFIED');

    const verificationToken = extractTokenFromEmail(capturedEmails[0]);
    const verifyResponse = await fetch(
      `${baseUrl}/api/v1/auth/verification/verify?token=${encodeURIComponent(verificationToken)}`,
    );
    assert.equal(verifyResponse.status, 200);

    const unlockedDocumentsResponse = await fetch(`${baseUrl}/api/v1/documents`, {
      headers: authHeaders,
    });
    assert.equal(unlockedDocumentsResponse.status, 200);

    console.log('verify:t86 passed');
  } finally {
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

function extractTokenFromEmail(email: CapturedEmail) {
  const match = email.text.match(/https?:\/\/\S+\?token=([a-f0-9]+)/i);
  assert.ok(match?.[1], 'Verification token link not found in email body');
  return match[1];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
