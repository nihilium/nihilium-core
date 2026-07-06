export type EvidenceOp = 'seal' | 'unseal';

export type EvidenceMeta = {
  chainId?: string;
  signingPubKey?: [string, string];
  hePubKey?: [string, string];
  hashedUnsealRoot?: string;
};

export type EvidenceRecord = {
  id: string;
  op: EvidenceOp;
  at: string;
  request: unknown;
  response: unknown;
  meta: EvidenceMeta;
};

export type PutReceipt = {
  backendId: string;
  recordId: string;
  size: number;
  etag?: string;
};

export type HeadResult = {
  recordId: string;
  size: number;
  etag?: string;
  exists: boolean;
};

export interface StorageBackend {
  readonly id: string;
  put(recordId: string, blob: Buffer): Promise<PutReceipt>;
  head(recordId: string): Promise<HeadResult>;
  /** Lightweight writability probe for health checks */
  probe(): Promise<boolean>;
}

export type QuorumConfig = {
  requiredAcks: number;
  totalBackends: number;
};

export type LocalBackendConfig = {
  type: 'local';
  path: string;
  id?: string;
};

export type S3BackendConfig = {
  type: 's3';
  bucket: string;
  region: string;
  prefix?: string;
  endpoint?: string;
  id?: string;
};

export type BackendConfig = LocalBackendConfig | S3BackendConfig;

export type EvidenceStoreConfig = {
  quorum: QuorumConfig;
  backends: BackendConfig[];
  encryptionKeyHex?: string;
};

export class EvidenceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceStoreError';
  }
}

export type BackendAckFailure = {
  backendId: string;
  reason: string;
};

export class QuorumNotMetError extends EvidenceStoreError {
  readonly requiredAcks: number;
  readonly totalBackends: number;
  readonly acked: number;
  readonly failures: BackendAckFailure[];

  constructor(
    requiredAcks: number,
    totalBackends: number,
    acked: number,
    failures: BackendAckFailure[]
  ) {
    super(
      `Evidence quorum not met: ${acked}/${requiredAcks} acks (configured ${requiredAcks}/${totalBackends})`
    );
    this.name = 'QuorumNotMetError';
    this.requiredAcks = requiredAcks;
    this.totalBackends = totalBackends;
    this.acked = acked;
    this.failures = failures;
  }

  toJSON() {
    return {
      error: 'evidence_quorum_not_met',
      acked: this.acked,
      required: this.requiredAcks,
      total: this.totalBackends,
      failures: this.failures,
    };
  }
}
