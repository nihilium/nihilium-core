import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { EvidenceRecord } from './types';

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

/**
 * Deterministic JSON serialization (sorted object keys, recursive).
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortValue(obj[key]);
  }
  return sorted;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function recordIdForPayload(payload: Omit<EvidenceRecord, 'id'>): string {
  return sha256Hex(canonicalStringify(payload));
}

export function buildRecord(
  op: EvidenceRecord['op'],
  request: unknown,
  response: unknown,
  meta: EvidenceRecord['meta']
): EvidenceRecord {
  const at = new Date().toISOString();
  const withoutId = { op, at, request, response, meta };
  const id = recordIdForPayload(withoutId);
  return { id, ...withoutId };
}

export function recordToBlob(record: EvidenceRecord): Buffer {
  return Buffer.from(canonicalStringify(record), 'utf8');
}

export function encryptBlob(blob: Buffer, keyHex: string): Buffer {
  const key = parseEncryptionKey(keyHex);
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(blob), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]), iv, tag, encrypted]);
}

export function decryptBlob(blob: Buffer, keyHex: string): Buffer {
  if (blob.length < 1 + GCM_IV_LENGTH + GCM_TAG_LENGTH) {
    throw new Error('Invalid encrypted evidence blob');
  }
  if (blob[0] !== 1) {
    throw new Error('Unsupported evidence encryption version');
  }
  const key = parseEncryptionKey(keyHex);
  const iv = blob.subarray(1, 1 + GCM_IV_LENGTH);
  const tag = blob.subarray(1 + GCM_IV_LENGTH, 1 + GCM_IV_LENGTH + GCM_TAG_LENGTH);
  const ciphertext = blob.subarray(1 + GCM_IV_LENGTH + GCM_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function parseEncryptionKey(keyHex: string): Buffer {
  const normalized = keyHex.startsWith('0x') ? keyHex.slice(2) : keyHex;
  const key = Buffer.from(normalized, 'hex');
  if (key.length !== 32) {
    throw new Error('EVIDENCE_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}
