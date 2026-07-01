import { config } from '../config/index.js';
import { connectDB } from '../config/db.js';
import { ensureDocumentChunkVectorIndex } from '../modules/documents/document-vector-search.service.js';

interface InitializeRuntimeOptions {
  role: 'api' | 'worker';
  ensureVectorIndex?: boolean;
}

export async function initializeRuntime(options: InitializeRuntimeOptions) {
  await connectDB();

  if (options.ensureVectorIndex !== false && config.vectorSearch.autoEnsureOnStartup) {
    const vectorIndex = await ensureDocumentChunkVectorIndex({
      allowUnsupported: true,
      waitForQueryable: false,
    });

    if (vectorIndex.supported) {
      console.log(
        `[${options.role}] Vector search index "${vectorIndex.indexName}" is configured`
        + `${vectorIndex.queryable ? ' and queryable' : ' (still building)'}`,
      );
    } else {
      console.warn(
        `[${options.role}] Skipping Atlas vector index ensure: ${vectorIndex.message ?? 'unsupported database'}`,
      );
    }
  }
}
