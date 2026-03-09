import argon2 from "argon2-browser";
import { randomBytes } from "./crypto-env.js";
import type { Argon2Params } from "./types.js";

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memory: 1048576,   // 1 GB in KiB
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
};

/**
 * Derive K_aon from ECDH shared secret using Argon2id.
 *
 * The memory-hard derivation is the mechanism that makes ZK proofs
 * of correct decryption infeasible — this is deliberate, not incidental.
 */
export async function deriveKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS
): Promise<Uint8Array<ArrayBuffer>> {
  const result = await argon2.hash({
    pass: sharedSecret,
    salt,
    type: argon2.ArgonType.Argon2id,
    mem: params.memory,
    time: params.iterations,
    parallelism: params.parallelism,
    hashLen: params.hashLength,
  });

  return new Uint8Array(result.hash);
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}
