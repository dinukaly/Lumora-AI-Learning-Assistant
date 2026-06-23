import app from './app.js';
import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import { ensureDocumentChunkVectorIndex } from './modules/documents/document-vector-search.service.js';

const startServer = async () => {
  // Connect to Database
  await connectDB();
  if (config.vectorSearch.autoEnsureOnStartup) {
    const vectorIndex = await ensureDocumentChunkVectorIndex({
      allowUnsupported: true,
      waitForQueryable: false,
    });

    if (vectorIndex.supported) {
      console.log(
        `Vector search index "${vectorIndex.indexName}" is configured` +
        `${vectorIndex.queryable ? ' and queryable' : ' (still building)'}`,
      );
    } else {
      console.warn(
        `Skipping Atlas vector index ensure: ${vectorIndex.message ?? 'unsupported database'}`,
      );
    }
  }
  await import('./common/queue/worker.js');

  const PORT = config.port;

  app.listen(PORT, () => {
    console.log(`Server running in ${config.env} mode on port ${PORT}`);
  });
};

startServer();
