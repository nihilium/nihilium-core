/**
 * A Baby Jubjub point in affine coordinates.
 * circomlibjs represents these as [bigint, bigint].
 */
export type BJJPoint = [bigint, bigint];

export interface BJJKeypair {
  privateKey: Uint8Array; // 32 bytes (scalar)
  publicKey: BJJPoint;
}

/**
 * The payload for a single processor in the threshold set.
 * This is what would normally be sent to that processor during unsealing.
 * Structure mirrors §5.2 / §6.2 of the whitepaper.
 */
export interface ProcessorPayload {
  processorId: string;
  ciphertexts: Uint8Array;   // HE-encrypted key chunks (ciF, ekF serialized)
  commitment: Uint8Array;    // severed commitment data
  metadata: Uint8Array;      // unseal_root, proof chain params, etc.
}

/**
 * The structured plaintext before AONT + encryption.
 */
export interface AONAEPayload {
  content: Uint8Array;
  peerPayloads: ProcessorPayload[];
  signal: Uint8Array;        // σ_i — 32 bytes, unique per processor
  nonce: Uint8Array;         // 32 bytes freshness
}

/**
 * The sealed output of the AONAE encryption process.
 */
export interface AONAECiphertext {
  ciphertext: Uint8Array;    // AES-GCM(K_aon, AONT(payload))
  iv: Uint8Array;            // 12 bytes AES-GCM nonce
  authTag: Uint8Array;       // 16 bytes GCM tag (included in ciphertext by Web Crypto)
  publicKey: BJJPoint;       // pk_e — ephemeral ECDH public key
  argon2Params: Argon2Params;
  salt: Uint8Array;          // 32 bytes Argon2id salt
}

export interface Argon2Params {
  memory: number;       // KiB — default 1048576 (1 GB)
  iterations: number;   // time cost — default 3
  parallelism: number;  // lanes — default 4
  hashLength: number;   // output bytes — 32
}

/**
 * Commitment placed in the public observer package.
 */
export interface SignalCommitment {
  processorId: string;
  commitment: Uint8Array; // H(σ_i)
}
