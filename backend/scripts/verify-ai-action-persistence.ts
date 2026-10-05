import assert from 'node:assert/strict';
import mongoose from 'mongoose';

async function main() {
  process.env.CHAT_PROVIDER ??= 'mock';
  process.env.EMBEDDING_PROVIDER ??= 'mock';

  const { connectDB } = await import('../src/config/db.js');
  const { default: app } = await import('../src/app.js');
  const { generateAccessToken } = await import('../src/common/utils/jwt.js');
  const { default: Document } = await import('../src/modules/documents/document.model.js');
  const { default: DocumentChunk } = await import('../src/modules/documents/document-chunk.model.js');
  const { default: User } = await import('../src/modules/users/user.model.js');
  const { default: AIActionArtifact } = await import('../src/modules/ai/ai-action-artifact.model.js');

  await connectDB();

  const user = await User.create({
    name: 'AI Action Persistence Verifier',
    email: `verify-t47-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
    emailVerifiedAt: new Date(),
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'Physics Notes',
    originalFileName: 'physics.pdf',
    storageUrl: 'https://example.com/physics.pdf',
    status: 'READY',
    fileSize: 2048,
    summary: {
      text: 'The notes explain force, acceleration, and Newtonian motion.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.insertMany([
    {
      documentId: document._id,
      chunkIndex: 0,
      text: 'Force causes acceleration according to Newton’s second law.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 2,
      tokenCount: 11,
      metadata: { pageNumbers: [2], startPageNumber: 2, endPageNumber: 2 },
    },
    {
      documentId: document._id,
      chunkIndex: 1,
      text: 'Acceleration describes how velocity changes over time.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 4,
      tokenCount: 10,
      metadata: { pageNumbers: [4], startPageNumber: 4, endPageNumber: 4 },
    },
  ]);

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/ai`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const summaryResponse = await fetch(`${baseUrl}/summarize-document`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId: document.id }),
    });
    assert.equal(summaryResponse.status, 200);

    const conceptsResponse = await fetch(`${baseUrl}/extract-concepts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId: document.id }),
    });
    assert.equal(conceptsResponse.status, 200);

    const latestResponse = await fetch(`${baseUrl}/actions/latest?documentId=${document.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(latestResponse.status, 200);
    const latestJson = await latestResponse.json();

    assert.equal(latestJson.documentId, document.id);
    assert.equal(latestJson.summary !== null, true);
    assert.equal(typeof latestJson.summary.summary, 'string');
    assert.equal(Array.isArray(latestJson.summary.takeaways), true);
    assert.equal(Array.isArray(latestJson.summary.sourceChunkIds), true);
    assert.equal(latestJson.concepts !== null, true);
    assert.equal(Array.isArray(latestJson.concepts.concepts), true);
    assert.equal(latestJson.concepts.concepts.length > 0, true);
    assert.equal(Array.isArray(latestJson.concepts.sourceChunkIds), true);

    const artifactCount = await AIActionArtifact.countDocuments({
      userId: user._id,
      documentId: document._id,
    });
    assert.equal(artifactCount, 2);

    console.log(JSON.stringify({
      artifactCount,
      summaryArtifactId: latestJson.summary.artifactId,
      conceptsArtifactId: latestJson.concepts.artifactId,
      conceptCount: latestJson.concepts.concepts.length,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      AIActionArtifact.deleteMany({ documentId: document._id }),
      DocumentChunk.deleteMany({ documentId: document._id }),
      Document.deleteMany({ _id: document._id }),
      User.deleteMany({ _id: user._id }),
    ]);

    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
