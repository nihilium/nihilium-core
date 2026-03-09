# AONAE Implementation Guide

## TypeScript — Browser & Node.js

### Dependencies

```json
{
  "dependencies": {
    "circomlibjs": "^0.1.7",
    "argon2-browser": "^1.18.0",
    "@noble/hashes": "^1.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**`circomlibjs`** — Baby Jubjub curve operations (same curve used in Nihilium's HE and signature layer).
**`argon2-browser`** — Argon2id implementation using WASM, works in both browser and Node.js.
**`@noble/hashes`** — SHA-256 and other hash functions, pure JS, no native dependencies.

### Platform-Agnostic Crypto

Both browser (`SubtleCrypto`) and Node.js 20+ (`crypto.subtle`) expose the Web Crypto API.
The implementation uses this exclusively for AES-GCM and random byte generation.

```typescript
// crypto-env.ts

export function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    return globalThis.crypto.subtle;
  }
  // Node.js < 19 fallback
  const { webcrypto } = require("crypto");
  return webcrypto.subtle;
}

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues !== "undefined") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    const { randomFillSync } = require("crypto");
    randomFillSync(buf);
  }
  return buf;
}
```

---

### Types

```typescript
// types.ts

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
  memory: number;   // KiB — default 1048576 (1 GB)
  iterations: number; // time cost — default 3
  parallelism: number; // lanes — default 4
  hashLength: number;  // output bytes — 32
}

/**
 * Commitment placed in the public observer package.
 */
export interface SignalCommitment {
  processorId: string;
  commitment: Uint8Array; // H(σ_i)
}
```

---

### Baby Jubjub ECDH

```typescript
// bjj-ecdh.ts

import { buildBabyjub, type BabyJub } from "circomlibjs";
import { randomBytes } from "./crypto-env";
import type { BJJKeypair, BJJPoint } from "./types";

let _bjj: BabyJub | null = null;

export async function getBJJ(): Promise<BabyJub> {
  if (!_bjj) {
    _bjj = await buildBabyjub();
  }
  return _bjj;
}

/**
 * Generate a Baby Jubjub keypair.
 * Private key is a random scalar mod subgroup order.
 */
export async function generateKeypair(): Promise<BJJKeypair> {
  const bjj = await getBJJ();
  const privateKey = randomBytes(32);

  // Reduce mod subgroup order to get valid scalar
  const scalar = bufToBigInt(privateKey) % bjj.subOrder;
  const privBytes = bigIntToBuf(scalar, 32);

  const publicKey = bjj.mulPointEscalar(bjj.Base8, scalar) as BJJPoint;

  return { privateKey: privBytes, publicKey };
}

/**
 * Compute ECDH shared secret: scalar · point.
 * Returns the x-coordinate of the resulting point, serialized to 32 bytes.
 */
export async function ecdh(
  privateKey: Uint8Array,
  publicKey: BJJPoint
): Promise<Uint8Array> {
  const bjj = await getBJJ();
  const scalar = bufToBigInt(privateKey);
  const shared = bjj.mulPointEscalar(publicKey, scalar);

  // Use x-coordinate as shared secret (standard for ECDH on twisted Edwards)
  return bigIntToBuf(bjj.F.toObject(shared[0]), 32);
}

function bufToBigInt(buf: Uint8Array): bigint {
  let result = 0n;
  for (let i = buf.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(buf[i]);
  }
  return result;
}

function bigIntToBuf(n: bigint, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  let val = n;
  for (let i = 0; i < len; i++) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return buf;
}
```

---

### Key Derivation (Argon2id)

```typescript
// kdf.ts

import argon2 from "argon2-browser";
import { randomBytes } from "./crypto-env";
import type { Argon2Params } from "./types";

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
): Promise<Uint8Array> {
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

export function generateSalt(): Uint8Array {
  return randomBytes(32);
}
```

---

### All-or-Nothing Transform

```typescript
// aont.ts

import { sha256 } from "@noble/hashes/sha256";
import { getSubtle, randomBytes } from "./crypto-env";

const BLOCK_SIZE = 32; // bytes

/**
 * Apply Rivest's All-or-Nothing Transform.
 *
 * Given plaintext bytes, produces transformed blocks where omitting
 * or altering ANY block (including the canary) corrupts ALL blocks.
 *
 * Construction:
 *   1. Generate random key K_r
 *   2. For each block m_i: m'_i = AES-ECB(K_r, i) ⊕ m_i
 *   3. Canary block: m'_last = K_r ⊕ H(m'_1 ∥ m'_2 ∥ ... ∥ m'_{n-1})
 */
export async function aontEncode(plaintext: Uint8Array): Promise<Uint8Array> {
  // Pad plaintext to block boundary
  const padded = padToBlockSize(plaintext);
  const blockCount = padded.length / BLOCK_SIZE;

  // Step 1: Generate random key
  const kr = randomBytes(BLOCK_SIZE);

  // Step 2: Transform each block
  const subtle = getSubtle();
  const aesKey = await subtle.importKey(
    "raw",
    kr,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"]
  );

  const transformedBlocks: Uint8Array[] = [];

  for (let i = 0; i < blockCount; i++) {
    const blockStart = i * BLOCK_SIZE;
    const block = padded.slice(blockStart, blockStart + BLOCK_SIZE);

    // AES-ECB(K_r, i) — simulate ECB by encrypting the counter with zero IV
    const counter = new Uint8Array(16); // AES block = 16 bytes
    new DataView(counter.buffer).setUint32(0, i, true);
    const zeroIV = new Uint8Array(16);

    const encrypted = await subtle.encrypt(
      { name: "AES-CBC", iv: zeroIV },
      aesKey,
      counter
    );

    // Take first BLOCK_SIZE bytes of AES output, XOR with plaintext block
    const mask = new Uint8Array(encrypted).slice(0, BLOCK_SIZE);
    const transformed = xor(block, mask);
    transformedBlocks.push(transformed);
  }

  // Step 3: Canary block = K_r ⊕ H(all transformed blocks)
  const allTransformed = concat(transformedBlocks);
  const digest = sha256(allTransformed);
  const canary = xor(kr, digest);

  // Output: transformed blocks + canary
  // Prepend original length for unpadding on decode
  const lengthPrefix = new Uint8Array(4);
  new DataView(lengthPrefix.buffer).setUint32(0, plaintext.length, true);

  return concat([lengthPrefix, allTransformed, canary]);
}

/**
 * Invert the AONT. Fails completely if any block has been altered.
 */
export async function aontDecode(encoded: Uint8Array): Promise<Uint8Array> {
  // Extract original length
  const originalLength = new DataView(
    encoded.buffer, encoded.byteOffset, 4
  ).getUint32(0, true);

  const body = encoded.slice(4);
  const blockCount = (body.length / BLOCK_SIZE) - 1; // last block is canary
  const transformedBlocks = body.slice(0, blockCount * BLOCK_SIZE);
  const canary = body.slice(blockCount * BLOCK_SIZE);

  // Recover K_r from canary
  const digest = sha256(transformedBlocks);
  const kr = xor(canary, digest);

  // Reverse transform each block
  const subtle = getSubtle();
  const aesKey = await subtle.importKey(
    "raw",
    kr,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt"]
  );

  const plaintextBlocks: Uint8Array[] = [];

  for (let i = 0; i < blockCount; i++) {
    const blockStart = i * BLOCK_SIZE;
    const block = transformedBlocks.slice(blockStart, blockStart + BLOCK_SIZE);

    const counter = new Uint8Array(16);
    new DataView(counter.buffer).setUint32(0, i, true);
    const zeroIV = new Uint8Array(16);

    const encrypted = await subtle.encrypt(
      { name: "AES-CBC", iv: zeroIV },
      aesKey,
      counter
    );

    const mask = new Uint8Array(encrypted).slice(0, BLOCK_SIZE);
    const original = xor(block, mask);
    plaintextBlocks.push(original);
  }

  // Remove padding
  const padded = concat(plaintextBlocks);
  return padded.slice(0, originalLength);
}

// --- helpers ---

function padToBlockSize(data: Uint8Array): Uint8Array {
  const remainder = data.length % BLOCK_SIZE;
  if (remainder === 0) return data;
  const padded = new Uint8Array(data.length + (BLOCK_SIZE - remainder));
  padded.set(data);
  return padded;
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return out;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
```

---

### AES-256-GCM Encryption

```typescript
// aes-gcm.ts

import { getSubtle, randomBytes } from "./crypto-env";

const IV_LENGTH = 12; // bytes — standard for GCM

/**
 * Encrypt with AES-256-GCM.
 * Returns { ciphertext (includes auth tag), iv }.
 */
export async function encrypt(
  key: Uint8Array,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const subtle = getSubtle();
  const iv = randomBytes(IV_LENGTH);

  const aesKey = await subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(encrypted), // GCM appends auth tag
    iv,
  };
}

/**
 * Decrypt with AES-256-GCM.
 * Throws on authentication failure (tampered ciphertext).
 */
export async function decrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const subtle = getSubtle();

  const aesKey = await subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    ciphertext
  );

  return new Uint8Array(decrypted);
}
```

---

### Payload Serialization

```typescript
// payload.ts

import type { AONAEPayload, ProcessorPayload } from "./types";

/**
 * Serialize an AONAE payload to bytes.
 *
 * Format:
 *   [4 bytes content length] [content]
 *   [4 bytes peer count]
 *   For each peer:
 *     [4 bytes processorId length] [processorId as UTF-8]
 *     [4 bytes ciphertexts length] [ciphertexts]
 *     [4 bytes commitment length]  [commitment]
 *     [4 bytes metadata length]    [metadata]
 *   [32 bytes signal]
 *   [32 bytes nonce]
 *
 * This is intentionally simple. In production, use a canonical
 * serialization format (protobuf, CBOR) to avoid ambiguity.
 */
export function serializePayload(payload: AONAEPayload): Uint8Array {
  const parts: Uint8Array[] = [];

  // Content
  parts.push(uint32(payload.content.length));
  parts.push(payload.content);

  // Peer payloads
  parts.push(uint32(payload.peerPayloads.length));
  for (const peer of payload.peerPayloads) {
    const idBytes = new TextEncoder().encode(peer.processorId);
    parts.push(uint32(idBytes.length));
    parts.push(idBytes);
    parts.push(uint32(peer.ciphertexts.length));
    parts.push(peer.ciphertexts);
    parts.push(uint32(peer.commitment.length));
    parts.push(peer.commitment);
    parts.push(uint32(peer.metadata.length));
    parts.push(peer.metadata);
  }

  // Signal and nonce (fixed 32 bytes each)
  parts.push(payload.signal);
  parts.push(payload.nonce);

  return concat(parts);
}

export function deserializePayload(data: Uint8Array): AONAEPayload {
  let offset = 0;

  function readUint32(): number {
    const val = new DataView(
      data.buffer, data.byteOffset + offset, 4
    ).getUint32(0, true);
    offset += 4;
    return val;
  }

  function readBytes(len: number): Uint8Array {
    const slice = data.slice(offset, offset + len);
    offset += len;
    return slice;
  }

  const contentLen = readUint32();
  const content = readBytes(contentLen);

  const peerCount = readUint32();
  const peerPayloads: ProcessorPayload[] = [];
  for (let i = 0; i < peerCount; i++) {
    const idLen = readUint32();
    const processorId = new TextDecoder().decode(readBytes(idLen));
    const ctLen = readUint32();
    const ciphertexts = readBytes(ctLen);
    const comLen = readUint32();
    const commitment = readBytes(comLen);
    const metaLen = readUint32();
    const metadata = readBytes(metaLen);
    peerPayloads.push({ processorId, ciphertexts, commitment, metadata });
  }

  const signal = readBytes(32);
  const nonce = readBytes(32);

  return { content, peerPayloads, signal, nonce };
}

// --- helpers ---

function uint32(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n, true);
  return buf;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
```

---

### AONAE — Main Interface

```typescript
// aonae.ts

import { sha256 } from "@noble/hashes/sha256";
import { generateKeypair, ecdh } from "./bjj-ecdh";
import { deriveKey, generateSalt, DEFAULT_ARGON2_PARAMS } from "./kdf";
import { aontEncode, aontDecode } from "./aont";
import { encrypt, decrypt } from "./aes-gcm";
import { serializePayload, deserializePayload } from "./payload";
import { randomBytes } from "./crypto-env";
import type {
  BJJPoint,
  AONAEPayload,
  AONAECiphertext,
  ProcessorPayload,
  Argon2Params,
  SignalCommitment,
} from "./types";

export interface SealResult {
  /** The AONAE ciphertext — stored in the private sealed package. */
  ciphertext: AONAECiphertext;
  /** Signal commitment — stored in the public observer package. */
  signalCommitment: SignalCommitment;
}

/**
 * AONAE Seal — Client side.
 *
 * Encrypts content along with peer payloads and a signal token into
 * an indivisible ciphertext. The ephemeral private key is destroyed;
 * recovery requires the sealed key pkF via the normal unsealing protocol.
 *
 * @param content       The data to seal.
 * @param peerPayloads  Complete processor payloads for all OTHER processors
 *                      in the threshold set. For n processors, this array
 *                      has n-1 entries.
 * @param pkF           The sealed public key from §5.2.
 * @param processorId   Identifier for the target processor (for the signal commitment).
 * @param argon2Params  Optional override for Argon2id parameters.
 */
export async function seal(
  content: Uint8Array,
  peerPayloads: ProcessorPayload[],
  pkF: BJJPoint,
  processorId: string,
  argon2Params: Argon2Params = DEFAULT_ARGON2_PARAMS
): Promise<SealResult> {
  // 1. Generate ephemeral keypair
  const ephemeral = await generateKeypair();

  // 2. ECDH shared secret
  const sharedSecret = await ecdh(ephemeral.privateKey, pkF);

  // 3. Argon2id key derivation
  const salt = generateSalt();
  const kAon = await deriveKey(sharedSecret, salt, argon2Params);

  // 4. Generate signal token
  const signal = randomBytes(32);
  const signalHash = sha256(signal);

  // 5. Construct and serialize payload
  const payload: AONAEPayload = {
    content,
    peerPayloads,
    signal,
    nonce: randomBytes(32),
  };
  const serialized = serializePayload(payload);

  // 6. Apply AONT
  const aontEncoded = await aontEncode(serialized);

  // 7. AES-GCM encrypt
  const { ciphertext, iv } = await encrypt(kAon, aontEncoded);

  // 8. Destroy ephemeral private key
  ephemeral.privateKey.fill(0);

  // Also destroy intermediate key material
  sharedSecret.fill(0);
  kAon.fill(0);

  return {
    ciphertext: {
      ciphertext,
      iv,
      authTag: ciphertext.slice(ciphertext.length - 16), // GCM tag is last 16 bytes
      publicKey: ephemeral.publicKey,
      argon2Params,
      salt,
    },
    signalCommitment: {
      processorId,
      commitment: signalHash,
    },
  };
}

/**
 * AONAE Unseal — Client side (normal flow).
 *
 * After recovering KF through the standard unsealing protocol (§6),
 * the client uses it to derive the ECDH shared secret and decrypt.
 *
 * @param sealed  The AONAE ciphertext from the private package.
 * @param kF      The recovered private key (KF = K1 + K2).
 */
export async function unseal(
  sealed: AONAECiphertext,
  kF: Uint8Array
): Promise<AONAEPayload> {
  // 1. Recompute ECDH shared secret: KF · pk_e
  const sharedSecret = await ecdh(kF, sealed.publicKey);

  // 2. Re-derive K_aon
  const kAon = await deriveKey(sharedSecret, sealed.salt, sealed.argon2Params);

  // 3. AES-GCM decrypt (throws on auth failure = tampered ciphertext)
  const aontEncoded = await decrypt(kAon, sealed.ciphertext, sealed.iv);

  // 4. Invert AONT
  const serialized = await aontDecode(aontEncoded);

  // 5. Deserialize payload
  const payload = deserializePayload(serialized);

  // Cleanup
  sharedSecret.fill(0);
  kAon.fill(0);

  return payload;
}

/**
 * AONAE Unseal — Processor side (out-of-protocol flow).
 *
 * A processor that has been given K2 (client's key component)
 * and the full AONAE ciphertext. The processor uses its own K1
 * to reconstruct KF and decrypt.
 *
 * This function intentionally returns the FULL payload including
 * peer_payloads and signal — the processor sees everything.
 * The caller (processor) decides what to return to the requestor
 * and what to retain.
 *
 * @param sealed  The AONAE ciphertext.
 * @param k1      The processor's private key component.
 * @param k2      The client's private key component (provided by requestor).
 */
export async function unsealAsProcessor(
  sealed: AONAECiphertext,
  k1: Uint8Array,
  k2: Uint8Array
): Promise<{
  payload: AONAEPayload;
  signal: Uint8Array;
  peerPayloads: ProcessorPayload[];
}> {
  // Reconstruct KF = K1 + K2 (scalar addition mod subgroup order)
  const { getBJJ } = await import("./bjj-ecdh");
  const bjj = await getBJJ();

  const k1Scalar = bufToBigInt(k1);
  const k2Scalar = bufToBigInt(k2);
  const kfScalar = (k1Scalar + k2Scalar) % bjj.subOrder;
  const kF = bigIntToBuf(kfScalar, 32);

  // Decrypt using the combined key
  const payload = await unseal(sealed, kF);

  // Cleanup
  kF.fill(0);

  // Processor now has full visibility.
  // Return structured so the processor can act on each component independently.
  return {
    payload,
    signal: payload.signal,           // retain for covert signaling
    peerPayloads: payload.peerPayloads, // retain for cartel capability
  };
}

// --- helpers ---

function bufToBigInt(buf: Uint8Array): bigint {
  let result = 0n;
  for (let i = buf.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(buf[i]);
  }
  return result;
}

function bigIntToBuf(n: bigint, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  let val = n;
  for (let i = 0; i < len; i++) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return buf;
}
```

---

### Signal Verification

```typescript
// signal.ts

import { sha256 } from "@noble/hashes/sha256";
import type { SignalCommitment } from "./types";

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
```

---

### Usage Example

```typescript
// example.ts

import { seal, unseal, unsealAsProcessor } from "./aonae";
import { verifySignal } from "./signal";
import type { ProcessorPayload } from "./types";

async function example() {
  // --- Setup ---
  // In a real deployment, pkF comes from the sealing protocol (§5.2).
  // Here we simulate with a standalone keypair.
  const { generateKeypair } = await import("./bjj-ecdh");
  const sealedKey = await generateKeypair();
  const pkF = sealedKey.publicKey;

  // Simulate peer payloads for a 3-processor threshold set.
  // Sealing for processor P1 — embed payloads for P2 and P3.
  const peerPayloads: ProcessorPayload[] = [
    {
      processorId: "P2",
      ciphertexts: new Uint8Array([/* P2's HE ciphertexts */]),
      commitment: new Uint8Array([/* P2's severed commitment */]),
      metadata: new Uint8Array([/* P2's unseal params */]),
    },
    {
      processorId: "P3",
      ciphertexts: new Uint8Array([/* P3's HE ciphertexts */]),
      commitment: new Uint8Array([/* P3's severed commitment */]),
      metadata: new Uint8Array([/* P3's unseal params */]),
    },
  ];

  const content = new TextEncoder().encode("secret document contents");

  // --- Seal ---
  // Use reduced Argon2 params for this example.
  // Production: memory=1048576 (1GB), iterations=3
  const result = await seal(content, peerPayloads, pkF, "P1", {
    memory: 1024, // 1 MB — example only
    iterations: 1,
    parallelism: 1,
    hashLength: 32,
  });

  console.log("Sealed. Signal commitment:", result.signalCommitment);
  // → signalCommitment goes into the public observer package.
  // → result.ciphertext goes into the private sealed package.

  // --- Normal unseal (client has recovered KF) ---
  const payload = await unseal(result.ciphertext, sealedKey.privateKey);
  const recovered = new TextDecoder().decode(payload.content);
  console.log("Normal unseal:", recovered);
  // Client discards payload.peerPayloads and payload.signal.

  // --- Out-of-protocol unseal (processor sees everything) ---
  // Simulate: requestor gives processor K2 and the full ciphertext.
  // For this example, K1 = sealedKey.privateKey, K2 = 0 (simplified).
  const processorResult = await unsealAsProcessor(
    result.ciphertext,
    sealedKey.privateKey,  // K1 (processor's component)
    new Uint8Array(32),    // K2 (client's component — simplified)
  );

  console.log("Processor sees peer payloads:", processorResult.peerPayloads.length);
  console.log("Processor has signal token (can publish covertly)");

  // --- Signal verification (by external observer) ---
  const isCompromised = verifySignal(
    processorResult.signal,
    result.signalCommitment
  );
  console.log("Signal verified:", isCompromised); // true
}

example().catch(console.error);
```

---

### Implementation Notes

**AONT block size.** Fixed at 32 bytes to align with SHA-256 digest size and AES-256 key
size. Larger blocks reduce the canary's effectiveness against fine-grained tampering.
Smaller blocks increase overhead. 32 bytes is standard for Rivest AONT implementations.

**AES-ECB simulation in AONT.** Web Crypto API does not expose ECB mode directly.
The implementation encrypts a 16-byte counter under AES-CBC with a zero IV, which
is equivalent to a single ECB block encryption. For BLOCK_SIZE > 16 bytes, only the
first 16 bytes of AES output are used and XOR'd against the corresponding portion of the
plaintext block. If BLOCK_SIZE exceeds 16, extend the counter encryption to produce
enough mask bytes (e.g., encrypt multiple counter values). The current implementation
handles this correctly for BLOCK_SIZE = 32 by using the first 32 bytes of the CBC output
(which for a single 16-byte input produces 32 bytes due to PKCS7 padding in CBC mode).

**Argon2id in browser.** The `argon2-browser` package uses WASM and will block the
main thread. For production browser usage, run the KDF in a Web Worker. The 1 GB
memory parameter is intentional and high — this is the mechanism that defeats ZK proofs.
If the target environment cannot allocate 1 GB, reduce accordingly but document the
security tradeoff: lower memory parameters make ZK circuits more feasible.

**Key destruction.** JavaScript does not guarantee memory zeroing. `Uint8Array.fill(0)`
is a best-effort signal. In security-critical deployments, use a WASM module for key
material handling where memory can be controlled more precisely, or run within a
secure enclave where memory is isolated.

**Canonical serialization.** The payload serialization is deliberately simple for
readability. Production implementations should use a canonical binary format (protobuf,
CBOR, or ASN.1 DER) to eliminate serialization ambiguity. Ambiguous serialization
could allow an attacker to construct two different payloads that serialize identically,
undermining the AONT's integrity guarantee.

**AONT vs AES-GCM ordering.** The AONT is applied before AES-GCM encryption,
not after. This means the GCM authentication tag protects the AONT output. If the
tag check fails, decryption aborts before AONT inversion — no partial information
is leaked. If the AONT were applied after encryption, an attacker could tamper with
the AONT layer without triggering the GCM check.
