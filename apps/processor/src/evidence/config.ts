import path from 'path';
import type {
  BackendConfig,
  EvidenceStoreConfig,
  QuorumConfig,
} from './types';
import { EvidenceStoreError } from './types';

const DEFAULT_QUORUM = '1/1';
const DEFAULT_LOCAL_PATH = path.join(process.cwd(), 'data', 'evidence');

export function parseQuorumString(quorum: string): QuorumConfig {
  const match = /^(\d+)\/(\d+)$/.exec(quorum.trim());
  if (!match) {
    throw new EvidenceStoreError(
      `Invalid EVIDENCE_QUORUM "${quorum}" (expected format W/N, e.g. 3/5)`
    );
  }
  const requiredAcks = parseInt(match[1], 10);
  const totalBackends = parseInt(match[2], 10);
  if (requiredAcks < 1 || totalBackends < 1 || requiredAcks > totalBackends) {
    throw new EvidenceStoreError(
      `Invalid EVIDENCE_QUORUM "${quorum}": require 1 <= W <= N`
    );
  }
  return { requiredAcks, totalBackends };
}

export function parseBackendsJson(raw: string): BackendConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EvidenceStoreError('EVIDENCE_BACKENDS must be valid JSON array');
  }
  if (!Array.isArray(parsed)) {
    throw new EvidenceStoreError('EVIDENCE_BACKENDS must be a JSON array');
  }
  return parsed.map((entry, index) => parseBackendEntry(entry, index));
}

function parseBackendEntry(entry: unknown, index: number): BackendConfig {
  if (!entry || typeof entry !== 'object') {
    throw new EvidenceStoreError(`EVIDENCE_BACKENDS[${index}] must be an object`);
  }
  const obj = entry as Record<string, unknown>;
  const type = obj.type;
  if (type === 'local') {
    if (typeof obj.path !== 'string' || !obj.path) {
      throw new EvidenceStoreError(`EVIDENCE_BACKENDS[${index}].path is required for local`);
    }
    return {
      type: 'local',
      path: resolveLocalBackendPath(obj.path),
      ...(typeof obj.id === 'string' ? { id: obj.id } : {}),
    };
  }
  if (type === 's3') {
    if (typeof obj.bucket !== 'string' || !obj.bucket) {
      throw new EvidenceStoreError(`EVIDENCE_BACKENDS[${index}].bucket is required for s3`);
    }
    if (typeof obj.region !== 'string' || !obj.region) {
      throw new EvidenceStoreError(`EVIDENCE_BACKENDS[${index}].region is required for s3`);
    }
    return {
      type: 's3',
      bucket: obj.bucket,
      region: obj.region,
      ...(typeof obj.prefix === 'string' ? { prefix: obj.prefix } : {}),
      ...(typeof obj.endpoint === 'string' ? { endpoint: obj.endpoint } : {}),
      ...(typeof obj.id === 'string' ? { id: obj.id } : {}),
    };
  }
  throw new EvidenceStoreError(
    `EVIDENCE_BACKENDS[${index}].type must be "local" or "s3"`
  );
}

export function loadEvidenceStoreConfig(
  env: NodeJS.ProcessEnv = process.env
): EvidenceStoreConfig {
  const quorumRaw = env.EVIDENCE_QUORUM ?? DEFAULT_QUORUM;
  const quorum = parseQuorumString(quorumRaw);

  let backends: BackendConfig[];
  if (env.EVIDENCE_BACKENDS) {
    backends = parseBackendsJson(env.EVIDENCE_BACKENDS);
  } else {
    backends = [{ type: 'local', path: DEFAULT_LOCAL_PATH, id: 'local:default' }];
  }

  if (backends.length !== quorum.totalBackends) {
    throw new EvidenceStoreError(
      `EVIDENCE_BACKENDS length (${backends.length}) must equal quorum N (${quorum.totalBackends})`
    );
  }

  const encryptionKeyHex = env.EVIDENCE_ENCRYPTION_KEY?.trim() || undefined;

  return { quorum, backends, encryptionKeyHex };
}

/** Relative paths are resolved under process.cwd() (e.g. apps/processor/data/e0). */
function resolveLocalBackendPath(configPath: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  return path.join(process.cwd(), configPath);
}
