import dns from 'dns';
import { config } from '../config/index.js';
import { connectDB } from '../config/db.js';
import { ensureDocumentChunkVectorIndex } from '../modules/documents/document-vector-search.service.js';

interface InitializeRuntimeOptions {
  role: 'api' | 'worker';
  ensureVectorIndex?: boolean;
}

export async function initializeRuntime(options: InitializeRuntimeOptions) {
  // Set custom DNS servers to fix SRV record lookup issues
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('Set custom DNS servers to 8.8.8.8 and 1.1.1.1');
  
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
