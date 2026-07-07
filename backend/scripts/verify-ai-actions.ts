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

  await connectDB();

  const user = await User.create({
    name: 'AI Actions Verifier',
    email: `verify-t46-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
    emailVerifiedAt: new Date(),
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'Cell Biology Notes',
    originalFileName: 'cell-biology.pdf',
    storageUrl: 'https://example.com/cell-biology.pdf',
    status: 'READY',
    fileSize: 2048,
    summary: {
      text: 'The notes explain ribosomes, messenger RNA, and protein synthesis in cells.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.insertMany([
    {
      documentId: document._id,
      chunkIndex: 0,
      text: 'Ribosomes translate messenger RNA into amino acid chains during protein synthesis.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 3,
      tokenCount: 14,
      metadata: { pageNumbers: [3], startPageNumber: 3, endPageNumber: 3 },
    },
    {
      documentId: document._id,
      chunkIndex: 1,
      text: 'Messenger RNA carries instructions from DNA to the ribosome for building proteins.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 5,
      tokenCount: 15,
      metadata: { pageNumbers: [5], startPageNumber: 5, endPageNumber: 5 },
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
    const summaryJson = await summaryResponse.json();
    assert.equal(typeof summaryJson.summary, 'string');
    assert.equal(summaryJson.summary.length > 0, true);
    assert.equal(Array.isArray(summaryJson.takeaways), true);
    assert.equal(summaryJson.citations.length > 0, true);

    const conceptsResponse = await fetch(`${baseUrl}/extract-concepts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId: document.id }),
    });

    assert.equal(conceptsResponse.status, 200);
    const conceptsJson = await conceptsResponse.json();
    assert.equal(Array.isArray(conceptsJson.concepts), true);
    assert.equal(conceptsJson.concepts.length > 0, true);
    assert.equal(typeof conceptsJson.concepts[0].title, 'string');
    assert.equal(typeof conceptsJson.concepts[0].description, 'string');
    assert.equal(conceptsJson.citations.length > 0, true);

    console.log(JSON.stringify({
      summaryLength: summaryJson.summary.length,
      takeawayCount: summaryJson.takeaways.length,
      conceptCount: conceptsJson.concepts.length,
      citedPages: conceptsJson.citations.map((citation: { pageNumber: number }) => citation.pageNumber),
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
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
