import { sha256 } from "@noble/hashes/sha256";
import type { SignalCommitment } from "./types.js";

/**
 * Verify a published signal against a known commitment.
 *
 * Called by an observer who holds the public observer package
 * and has seen a signal value appear in the datastream or on-chain.
 *
 * Returns true if the signal matches the commitment, proving an
 * out-of-protocol decryption occurred for this seal.
 */
export function verifySignal(
  publishedSignal: Uint8Array,
  commitment: SignalCommitment
): boolean {
  const hash = sha256(publishedSignal);
  return constantTimeEqual(hash, commitment.commitment);
}

/**
 * Constant-time comparison to prevent timing side channels.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
