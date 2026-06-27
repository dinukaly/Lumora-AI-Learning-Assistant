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
  const { default: Conversation } = await import('../src/modules/conversations/conversation.model.js');
  const { default: Message } = await import('../src/modules/conversations/message.model.js');
  const { default: UsageEvent } = await import('../src/modules/analytics/usage-event.model.js');

  await connectDB();

  const user = await User.create({
    name: 'AI Chat Verifier',
    email: `verify-t44-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'Biology Notes',
    originalFileName: 'biology.pdf',
    storageUrl: 'https://example.com/biology.pdf',
    status: 'READY',
    fileSize: 2048,
    summary: {
      text: 'The notes explain how ribosomes help cells build proteins.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.create({
    documentId: document._id,
    chunkIndex: 0,
    text: 'Ribosomes build proteins by translating messenger RNA into amino acid chains inside the cell.',
    embedding: new Array(384).fill(0.1),
    pageNumber: 7,
    tokenCount: 18,
    metadata: {
      pageNumbers: [7],
      startPageNumber: 7,
      endPageNumber: 7,
    },
  });

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
  const server = app.listen(0);
  const createdConversationIds = new Set<string>();

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/ai/chat`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const jsonResponse = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentId: document.id,
        message: 'Explain how ribosomes help the cell.',
      }),
    });

    assert.equal(jsonResponse.status, 200);
    const jsonBody = await jsonResponse.json();
    assert.equal(jsonBody.message.role, 'assistant');
    assert.equal(jsonBody.message.citations.length, 1);
    assert.equal(jsonBody.message.citations[0].pageNumber, 7);
    createdConversationIds.add(jsonBody.message.conversationId);

    const streamResponse = await fetch(`${baseUrl}?stream=true`, {
      method: 'POST',
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        documentId: document.id,
        message: 'What do the notes say about ribosomes?',
      }),
    });

    assert.equal(streamResponse.status, 200);
    assert.equal(streamResponse.headers.get('content-type')?.includes('text/event-stream'), true);

    const streamText = await streamResponse.text();
    assert.equal(streamText.includes('event: chunk'), true);
    assert.equal(streamText.includes('event: done'), true);

    for (const match of streamText.matchAll(/"conversationId":"([^"]+)"/g)) {
      createdConversationIds.add(match[1]);
    }

    const conversationIds = Array.from(createdConversationIds).map((id) => new mongoose.Types.ObjectId(id));
    const conversationCount = await Conversation.countDocuments({ _id: { $in: conversationIds }, userId: user._id });
    const messageCount = await Message.countDocuments({ conversationId: { $in: conversationIds } });
    const usageCount = await UsageEvent.countDocuments({ userId: user._id });

    assert.equal(conversationCount >= 2, true);
    assert.equal(messageCount >= 4, true);
    assert.equal(usageCount >= 2, true);

    console.log(JSON.stringify({
      assistantMessageId: jsonBody.message.id,
      citedPage: jsonBody.message.citations[0].pageNumber,
      conversationCount,
      messageCount,
      usageCount,
      streamed: true,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      UsageEvent.deleteMany({ userId: user._id }),
      Message.deleteMany({ conversationId: { $in: Array.from(createdConversationIds) } }),
      Conversation.deleteMany({ _id: { $in: Array.from(createdConversationIds) } }),
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
