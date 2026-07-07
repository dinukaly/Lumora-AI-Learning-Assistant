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
    name: 'AI Deep Dive Verifier',
    email: `verify-t49-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
    emailVerifiedAt: new Date(),
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'Biology Study Notes',
    originalFileName: 'biology-notes.pdf',
    storageUrl: 'https://example.com/biology-notes.pdf',
    status: 'READY',
    fileSize: 3072,
    summary: {
      text: 'The notes explain ribosomes, messenger RNA, and how cells build proteins.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.insertMany([
    {
      documentId: document._id,
      chunkIndex: 0,
      text: 'Ribosomes are cellular structures that translate messenger RNA into amino acid chains during protein synthesis.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 2,
      tokenCount: 16,
      metadata: { pageNumbers: [2], startPageNumber: 2, endPageNumber: 2 },
    },
    {
      documentId: document._id,
      chunkIndex: 1,
      text: 'Messenger RNA carries genetic instructions from DNA to ribosomes so proteins can be assembled.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 4,
      tokenCount: 15,
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

    const conceptResponse = await fetch(`${baseUrl}/explain-concept`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentId: document.id,
        topic: 'Ribosomes',
      }),
    });

    assert.equal(conceptResponse.status, 200);
    const conceptJson = await conceptResponse.json();
    assert.equal(conceptJson.documentId, document.id);
    assert.equal(conceptJson.topic, 'Ribosomes');
    assert.equal(typeof conceptJson.explanation, 'string');
    assert.equal(conceptJson.explanation.length > 0, true);
    assert.equal(Array.isArray(conceptJson.citations), true);
    assert.equal(conceptJson.citations.length > 0, true);

    const takeawayResponse = await fetch(`${baseUrl}/explain-concept`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentId: document.id,
        topic: 'Messenger RNA carries instructions from DNA to ribosomes.',
      }),
    });

    assert.equal(takeawayResponse.status, 200);
    const takeawayJson = await takeawayResponse.json();
    assert.equal(typeof takeawayJson.explanation, 'string');
    assert.equal(takeawayJson.explanation.length > 0, true);
    assert.equal(Array.isArray(takeawayJson.citations), true);
    assert.equal(takeawayJson.citations.length > 0, true);

    console.log(JSON.stringify({
      conceptTopic: conceptJson.topic,
      conceptCitationPages: conceptJson.citations.map((citation: { pageNumber: number }) => citation.pageNumber),
      takeawayTopic: takeawayJson.topic,
      takeawayCitationPages: takeawayJson.citations.map((citation: { pageNumber: number }) => citation.pageNumber),
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
