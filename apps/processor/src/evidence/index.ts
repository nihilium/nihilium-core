import { LocalStorageBackend } from './backends/local';
import { loadEvidenceStoreConfig } from './config';
import { QuorumEvidenceStore } from './quorum-store';
import type { BackendConfig, StorageBackend } from './types';
import { EvidenceStoreError } from './types';

export { QuorumEvidenceStore } from './quorum-store';
export type { PersistInput, EvidenceHealth } from './quorum-store';
export { QuorumNotMetError, EvidenceStoreError } from './types';
export type { EvidenceRecord, EvidenceMeta, EvidenceOp } from './types';
export { loadEvidenceStoreConfig, parseQuorumString } from './config';

function buildBackend(config: BackendConfig, index: number): StorageBackend {
  if (config.type === 'local') {
    return new LocalStorageBackend(config.path, config.id ?? `local:${index}`);
  }
  try {
    // Lazy load so local-only dev does not require @aws-sdk/client-s3 at startup
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3StorageBackend } = require('./backends/s3') as typeof import('./backends/s3');
    return new S3StorageBackend(config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Cannot find module') && msg.includes('@aws-sdk/client-s3')) {
      throw new EvidenceStoreError(
        'S3 evidence backend configured but @aws-sdk/client-s3 is not installed. ' +
          'Run: cd apps/processor && npm install @aws-sdk/client-s3@3.758.0 --no-workspaces'
      );
    }
    throw err;
  }
}

export async function createEvidenceStore(
  env: NodeJS.ProcessEnv = process.env
): Promise<QuorumEvidenceStore> {
  const storeConfig = loadEvidenceStoreConfig(env);
  const backends = storeConfig.backends.map((cfg, i) => buildBackend(cfg, i));

  for (const backend of backends) {
    if (backend instanceof LocalStorageBackend) {
      await backend.ensureReady();
    }
  }

  return new QuorumEvidenceStore(storeConfig, backends);
}
