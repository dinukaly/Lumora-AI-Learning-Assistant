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
const {
  ensureDocumentChunkVectorIndex,
  searchDocumentChunksByQuery,
} = await import('../src/modules/documents/document-vector-search.service.js');

async function main() {
  await mongoose.connect(config.mongodb.uri);

  const ownerId = new mongoose.Types.ObjectId();
  const document = await Document.create({
    ownerId,
    title: 'T3.4 verification',
    originalFileName: 't3.4-verification.pdf',
    storageUrl: 'local://t3.4-verification.pdf',
    status: 'PROCESSING',
    extractedText:
      'Cell membranes regulate transport. Ribosomes build proteins. Volcanoes erupt from magma.',
    extractedPages: [
      {
        page: 1,
        text:
          'Cell membranes regulate transport across the boundary of the cell. ' +
          'Ribosomes build proteins used by the organism.',
      },
      {
        page: 2,
        text:
          'Volcanoes erupt when magma, ash, and gases reach the surface. ' +
          'This belongs to geology, not cell biology.',
      },
    ],
  });

  try {
    await processDocumentChunking(document.id);
    const indexResult = await ensureDocumentChunkVectorIndex({
      allowUnsupported: true,
      waitForQueryable: true,
    });

    if (!indexResult.supported) {
      console.log(
        JSON.stringify(
          {
            supported: false,
            reason: indexResult.message,
            hint: 'Connect the backend to a MongoDB Atlas cluster to run $vectorSearch verification.',
          },
          null,
          2,
        ),
      );
      return;
    }

    const matches = await searchDocumentChunksByQuery('How do ribosomes make proteins?', {
      documentId: document.id,
      limit: 2,
    });

    console.log(
      JSON.stringify(
        {
          supported: true,
          queryable: indexResult.queryable,
          resultCount: matches.length,
          topMatch: matches[0]
            ? {
                chunkIndex: matches[0].chunkIndex,
                pageNumber: matches[0].pageNumber ?? null,
                score: matches[0].score,
                textPreview: matches[0].text.slice(0, 120),
              }
            : null,
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
