process.env.EMBEDDING_PROVIDER ??= 'local';
process.env.EMBEDDING_MODEL ??= 'Xenova/all-MiniLM-L6-v2';
process.env.EMBEDDING_DIMENSIONS ??= '384';

const mongoose = (await import('mongoose')).default;
const { config } = await import('../src/config/index.js');
const Document = (await import('../src/modules/documents/document.model.js')).default;
const DocumentChunk = (await import('../src/modules/documents/document-chunk.model.js')).default;
const { processDocumentChunking } = await import(
  '../src/modules/documents/document-chunking.service.js'
);

async function main() {
  await mongoose.connect(config.mongodb.uri);

  const ownerId = new mongoose.Types.ObjectId();
  const document = await Document.create({
    ownerId,
    title: 'T3.3 verification',
    originalFileName: 't3.3-verification.pdf',
    storageUrl: 'local://t3.3-verification.pdf',
    status: 'PROCESSING',
    extractedText:
      'The cell membrane regulates transport. Ribosomes create proteins. Enzymes speed reactions.',
    extractedPages: [
      {
        page: 1,
        text:
          'The cell membrane regulates transport across the boundary of the cell. ' +
          'Ribosomes create proteins used throughout the organism.',
      },
      {
        page: 2,
        text:
          'Enzymes speed reactions by lowering activation energy. ' +
          'Cells rely on these reactions for metabolism and repair.',
      },
    ],
  });

  try {
    const result = await processDocumentChunking(document.id);
    const storedChunks = await DocumentChunk.find({ documentId: document._id })
      .sort({ chunkIndex: 1 })
      .lean();
    const refreshedDocument = await Document.findById(document._id).select('status').lean();

    console.log(
      JSON.stringify(
        {
          documentId: document.id,
          status: refreshedDocument?.status,
          chunkCount: result.chunkCount,
          storedChunkCount: storedChunks.length,
          embeddingDimensions: result.embeddingDimensions,
          firstChunkPage: storedChunks[0]?.pageNumber ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([
      DocumentChunk.deleteMany({ documentId: document._id }),
      Document.deleteOne({ _id: document._id }),
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
