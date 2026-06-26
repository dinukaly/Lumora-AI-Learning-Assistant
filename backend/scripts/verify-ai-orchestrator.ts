process.env.EMBEDDING_PROVIDER ??= 'local';
process.env.EMBEDDING_MODEL ??= 'Xenova/all-MiniLM-L6-v2';
process.env.EMBEDDING_DIMENSIONS ??= '384';
process.env.CHAT_PROVIDER ??= 'mock';

const mongoose = (await import('mongoose')).default;
const { config } = await import('../src/config/index.js');
const User = (await import('../src/modules/users/user.model.js')).default;
const Document = (await import('../src/modules/documents/document.model.js')).default;
const DocumentChunk = (await import('../src/modules/documents/document-chunk.model.js')).default;
const { processDocumentChunking } = await import(
  '../src/modules/documents/document-chunking.service.js'
);
const { AIService } = await import('../src/modules/ai/ai.service.js');

async function main() {
  await mongoose.connect(config.mongodb.uri);

  const user = await User.create({
    name: 'AI Orchestrator Verify',
    email: `ai-orchestrator-${Date.now()}@example.com`,
    passwordHash: 'secret123',
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'Cell Biology Notes',
    originalFileName: 'cell-biology-notes.pdf',
    storageUrl: 'local://cell-biology-notes.pdf',
    status: 'PROCESSING',
    summary: {
      text: 'An introduction to cell structure, protein creation, and membranes.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
    extractedPages: [
      {
        page: 1,
        text: 'Ribosomes build proteins for the cell. The cell membrane regulates transport in and out of the cell.',
      },
      {
        page: 2,
        text: 'Enzymes help reactions happen faster. Cells rely on proteins and membranes to function well.',
      },
    ],
  });

  try {
    await processDocumentChunking(document.id);

    const orchestrator = new AIService();
    const result = await orchestrator.process({
      userId: user.id,
      documentId: document.id,
      message: 'Explain how ribosomes help a cell.',
    });

    console.log(
      JSON.stringify(
        {
          action: result.action,
          conversationId: result.conversationId,
          citationCount: result.citations.length,
          firstCitationPage: result.citations[0]?.pageNumber ?? null,
          contentPreview: result.content.slice(0, 120),
          tokensUsed: result.tokenUsage.total,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([
      DocumentChunk.deleteMany({ documentId: document._id }),
      Document.deleteOne({ _id: document._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.exit();
});
