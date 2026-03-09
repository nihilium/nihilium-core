import { sha256 } from "@noble/hashes/sha256";
import { getSubtle, randomBytes } from "./crypto-env.js";

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

    // Take first BLOCK_SIZE bytes of AES output, XOR with plaintext block.
    // A 16-byte input under AES-CBC with PKCS7 produces 32 bytes output,
    // giving us exactly BLOCK_SIZE=32 bytes of mask material.
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

function padToBlockSize(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const remainder = data.length % BLOCK_SIZE;
  if (remainder === 0) return new Uint8Array(data); // copy into fresh ArrayBuffer
  const padded = new Uint8Array(data.length + (BLOCK_SIZE - remainder));
  padded.set(data);
  return padded;
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
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
