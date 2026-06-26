import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import Document from '../src/modules/documents/document.model.js';
import { ConversationsService } from '../src/modules/conversations/conversations.service.js';
import Conversation from '../src/modules/conversations/conversation.model.js';
import Message from '../src/modules/conversations/message.model.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const user = await User.create({
    name: 'Conversation Verifier',
    email: `verify-t43-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'React Hooks Study Notes',
    originalFileName: 'react-hooks.pdf',
    storageUrl: 'https://example.com/react-hooks.pdf',
    status: 'READY',
    fileSize: 1024,
  });

  const scopedConversation = await ConversationsService.createConversation({
    userId: user.id,
    documentId: document.id,
    title: 'Learning React Hooks',
  });

  await ConversationsService.addMessage({
    conversationId: scopedConversation.id,
    role: 'user',
    content: 'Explain how React hooks work.',
  });

  await ConversationsService.addMessage({
    conversationId: scopedConversation.id,
    role: 'assistant',
    content: 'React hooks let function components use state and lifecycle-style features.',
    citations: [
      {
        documentId: document.id,
        pageNumber: 12,
        snippet: 'Hooks let you use state and other React features without writing a class.',
      },
    ],
    tokenUsage: {
      prompt: 850,
      completion: 320,
      total: 1170,
    },
  });

  await ConversationsService.createConversation({
    userId: user.id,
    title: 'General study chat',
  });

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/conversations`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    const listResponse = await fetch(`${baseUrl}?documentId=${document.id}&page=1&limit=10`, {
      headers,
    });
    assert.equal(listResponse.status, 200);

    const listJson = await listResponse.json();
    assert.equal(listJson.total, 1);
    assert.equal(listJson.conversations.length, 1);
    assert.equal(listJson.conversations[0].id, scopedConversation.id);
    assert.equal(listJson.conversations[0].messageCount, 2);
    assert.equal(listJson.conversations[0].documentId, document.id);

    const detailResponse = await fetch(`${baseUrl}/${scopedConversation.id}`, { headers });
    assert.equal(detailResponse.status, 200);

    const detailJson = await detailResponse.json();
    assert.equal(detailJson.id, scopedConversation.id);
    assert.equal(detailJson.messages.length, 2);
    assert.equal(detailJson.messages[1].role, 'assistant');
    assert.equal(detailJson.messages[1].citations[0].pageNumber, 12);

    console.log(JSON.stringify({
      conversationId: detailJson.id,
      listedConversations: listJson.total,
      messageCount: detailJson.messages.length,
      citedPage: detailJson.messages[1].citations[0].pageNumber,
      title: detailJson.title,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      Message.deleteMany({}),
      Conversation.deleteMany({}),
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
