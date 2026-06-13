import {
  buildRecord,
  encryptBlob,
  recordToBlob,
} from './canonical';
import type {
  BackendAckFailure,
  EvidenceMeta,
  EvidenceOp,
  EvidenceRecord,
  EvidenceStoreConfig,
  PutReceipt,
  StorageBackend,
} from './types';
import { QuorumNotMetError } from './types';

export type PersistInput = {
  op: EvidenceOp;
  request: unknown;
  response: unknown;
  meta: EvidenceMeta;
};

export type HealthBackendStatus = {
  id: string;
  ok: boolean;
};

export type EvidenceHealth = {
  quorum: string;
  requiredAcks: number;
  totalBackends: number;
  backends: HealthBackendStatus[];
  healthy: boolean;
};

export class QuorumEvidenceStore {
  private readonly backends: StorageBackend[];
  private readonly requiredAcks: number;
  private readonly totalBackends: number;
  private readonly encryptionKeyHex?: string;

  constructor(config: EvidenceStoreConfig, backends: StorageBackend[]) {
    if (backends.length !== config.quorum.totalBackends) {
      throw new Error(
        `Backend count ${backends.length} does not match quorum total ${config.quorum.totalBackends}`
      );
    }
    this.backends = backends;
    this.requiredAcks = config.quorum.requiredAcks;
    this.totalBackends = config.quorum.totalBackends;
    this.encryptionKeyHex = config.encryptionKeyHex;
  }

  get quorumLabel(): string {
    return `${this.requiredAcks}/${this.totalBackends}`;
  }

  async persist(input: PersistInput): Promise<EvidenceRecord> {
    const record = buildRecord(input.op, input.request, input.response, input.meta);
    let blob = recordToBlob(record);
    if (this.encryptionKeyHex) {
      blob = encryptBlob(blob, this.encryptionKeyHex);
    }

    const failures: BackendAckFailure[] = [];
    const receipts: PutReceipt[] = [];

    const results = await Promise.allSettled(
      this.backends.map(async (backend) => {
        const receipt = await backend.put(record.id, blob);
        if (receipt.size !== blob.length) {
          throw new Error(
            `Size mismatch on ${backend.id}: expected ${blob.length}, got ${receipt.size}`
          );
        }
        if (receipt.recordId !== record.id) {
          throw new Error(`Record id mismatch on ${backend.id}`);
        }
        return receipt;
      })
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const backend = this.backends[i];
      if (result.status === 'fulfilled') {
        receipts.push(result.value);
      } else {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push({ backendId: backend.id, reason });
        console.error(`Evidence backend ${backend.id} failed:`, reason);
      }
    }

    if (receipts.length < this.requiredAcks) {
      throw new QuorumNotMetError(
        this.requiredAcks,
        this.totalBackends,
        receipts.length,
        failures
      );
    }

    return record;
  }

  async checkHealth(): Promise<EvidenceHealth> {
    const probeResults = await Promise.all(
      this.backends.map(async (backend) => ({
        id: backend.id,
        ok: await backend.probe(),
      }))
    );
    const okCount = probeResults.filter((r) => r.ok).length;
    return {
      quorum: this.quorumLabel,
      requiredAcks: this.requiredAcks,
      totalBackends: this.totalBackends,
      backends: probeResults,
      healthy: okCount >= this.requiredAcks,
    };
  }
}
