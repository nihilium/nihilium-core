/**
 * Test-only mock for argon2-browser.
 *
 * argon2-browser uses emscripten WASM which fails to load in Node.js v24
 * (URL parsing incompatibility). For unit and integration tests, we replace
 * Argon2id with HMAC-SHA256 which is deterministic and fast.
 *
 * This mock preserves the argon2-browser API surface exactly so that the
 * production kdf.ts source is exercised unchanged (only the underlying
 * hash changes during tests).
 */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

export const ArgonType = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2,
} as const;

export interface Argon2HashOptions {
  pass: Uint8Array | string;
  salt: Uint8Array | string;
  type: number;
  mem: number;
  time: number;
  parallelism: number;
  hashLen: number;
}

export interface Argon2HashResult {
  hash: Uint8Array;
  hashHex: string;
  encoded: string;
}

/**
 * Deterministic mock: HMAC-SHA256(pass, salt) truncated/extended to hashLen.
 * Not cryptographically equivalent to Argon2id, but sufficient for testing
 * that the seal/unseal round-trip works end-to-end.
 */
export async function hash(opts: Argon2HashOptions): Promise<Argon2HashResult> {
  const passBytes =
    typeof opts.pass === "string"
      ? new TextEncoder().encode(opts.pass)
      : opts.pass;
  const saltBytes =
    typeof opts.salt === "string"
      ? new TextEncoder().encode(opts.salt)
      : opts.salt;

  // Produce exactly hashLen bytes by chaining HMAC rounds
  const chunks: Uint8Array[] = [];
  let remaining = opts.hashLen;
  let counter = 0;
  while (remaining > 0) {
    const counterBuf = new Uint8Array(4);
    new DataView(counterBuf.buffer).setUint32(0, counter++, true);
    const chunk = hmac(sha256, passBytes, concat([saltBytes, counterBuf]));
    chunks.push(chunk.slice(0, Math.min(remaining, chunk.length)));
    remaining -= chunk.length;
  }

  const result = concat(chunks).slice(0, opts.hashLen);
  const hashHex = Array.from(result)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { hash: result, hashHex, encoded: `$argon2id$mock$${hashHex}` };
}

export async function verify(): Promise<boolean> {
  return true;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export default { ArgonType, hash, verify };
