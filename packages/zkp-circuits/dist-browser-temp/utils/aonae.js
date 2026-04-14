import { SNARK_FIELD_SIZE, babyJub } from "./types";
import { decode, encode } from "./decode";
import { encrypt, formatPrivKeyForBabyJub, generateRandom248BitNumber, } from "./tools"; // adjust to your actual module
// =============================================================================
// Configuration
// =============================================================================
const CHUNK_BIT_SIZE = 16;
const CHUNK_MAX = 1 << CHUNK_BIT_SIZE; // 65536
const CHUNK_BYTE_SIZE = CHUNK_BIT_SIZE / 8; // 2 bytes per chunk
// =============================================================================
// PRF: derive a new masking key (curve point) from a previous one + index
//
// We hash the compressed point concatenated with the chunk index to get a
// scalar, then multiply the base point by that scalar. This gives us a
// deterministic, unpredictable curve point per chunk that can only be
// computed if you know the initial shared secret (which requires the
// private key).
// =============================================================================
function prfMaskingKey(previousMaskingKey, index) {
    // Hash the previous masking key's hex representation with the index
    // to derive a scalar, then map it to a curve point.
    const input = previousMaskingKey.toHex() + ":" + index.toString();
    const scalar = scalarHashFromString(input);
    // masking_key_i = scalar_i · G  (a new curve point)
    return babyJub.BASE.multiply(scalar);
}
/**
 * Hash a string to a scalar suitable for BabyJubJub.
 * Replace this with Poseidon or another ZK-friendly hash if you need
 * circuit compatibility. For now we use a simple approach that matches
 * the formatPrivKeyForBabyJub pattern from your codebase.
 */
function scalarHashFromString(input) {
    // Use the same hashing infrastructure your codebase already has.
    // This is a placeholder — swap in Poseidon/SHA-256 as needed.
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    // Simple HMAC-style: use your existing salt → privkey formatter
    // or implement a proper hash-to-scalar here.
    let hash = BigInt(0);
    for (let i = 0; i < data.length; i++) {
        hash = (hash * BigInt(31) + BigInt(data[i])) % SNARK_FIELD_SIZE;
    }
    // Ensure non-zero
    if (hash === BigInt(0))
        hash = BigInt(1);
    return formatPrivKeyForBabyJub(hash);
}
// =============================================================================
// PRF for AONT: derive a 16-bit pad from key K and index i
// =============================================================================
function aontPRF(K, index) {
    const input = K.toString(16) + ":" + index.toString();
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    let hash = BigInt(0);
    for (let i = 0; i < data.length; i++) {
        hash = (hash * BigInt(31) + BigInt(data[i])) % BigInt(CHUNK_MAX);
    }
    return hash;
}
/**
 * Hash all AONT-transformed chunks to produce a 16-bit value for the canary.
 */
function hashAllChunks(chunks) {
    let hash = BigInt(0);
    for (let i = 0; i < chunks.length; i++) {
        hash = (hash * BigInt(31) + chunks[i]) % BigInt(CHUNK_MAX);
    }
    return hash;
}
// =============================================================================
// Message ↔ chunk conversion
// =============================================================================
function messageToChunks(message) {
    const chunks = [];
    for (let i = 0; i < message.length; i += CHUNK_BYTE_SIZE) {
        let val = BigInt(0);
        for (let j = 0; j < CHUNK_BYTE_SIZE && i + j < message.length; j++) {
            val = val | (BigInt(message[i + j]) << BigInt(j * 8));
        }
        chunks.push(val);
    }
    return chunks;
}
function chunksToMessage(chunks, originalLength) {
    const result = new Uint8Array(originalLength);
    let offset = 0;
    for (let i = 0; i < chunks.length && offset < originalLength; i++) {
        for (let j = 0; j < CHUNK_BYTE_SIZE && offset < originalLength; j++) {
            result[offset] = Number((chunks[i] >> BigInt(j * 8)) & BigInt(0xff));
            offset++;
        }
    }
    return result;
}
// =============================================================================
// All-or-Nothing Transform
// =============================================================================
function aontTransform(chunks) {
    // Step 1: Generate random 16-bit key K
    const K = BigInt(Math.floor(Math.random() * CHUNK_MAX));
    // Step 2: XOR each chunk with PRF(K, i)
    const transformed = [];
    for (let i = 0; i < chunks.length; i++) {
        const pad = aontPRF(K, i);
        transformed.push(chunks[i] ^ pad);
    }
    // Step 3: Compute canary chunk that hides K
    // canary = K XOR hash(all transformed chunks)
    const h = hashAllChunks(transformed);
    const canary = K ^ h;
    transformed.push(canary);
    return { transformed };
}
function aontReverse(transformed) {
    const n = transformed.length - 1; // last element is the canary
    // Step 1: Separate data chunks and canary
    const dataChunks = transformed.slice(0, n);
    const canary = transformed[n];
    // Step 2: Recover K = canary XOR hash(data chunks)
    const h = hashAllChunks(dataChunks);
    const K = canary ^ h;
    // Step 3: XOR each chunk with PRF(K, i) to recover original
    const original = [];
    for (let i = 0; i < n; i++) {
        const pad = aontPRF(K, i);
        original.push(dataChunks[i] ^ pad);
    }
    return original;
}
export function fullAONEncrypt(message, pubKey) {
    // 1. Split into 16-bit chunks
    const chunks = messageToChunks(message);
    // 2. Apply AONT (adds one canary chunk)
    const { transformed } = aontTransform(chunks);
    // 3. Encrypt first chunk with standard ElGamal to establish shared secret
    const nonce = generateRandom248BitNumber();
    const firstEncrypted = encrypt(pubKey, encode(babyJub.BASE, transformed[0]), nonce);
    const ephemeralKey = firstEncrypted.ephemeral_key;
    // masking_key_0 = nonce · PubKey  (the shared secret from ElGamal)
    const maskingKey0 = pubKey.multiply(nonce);
    const encryptedChunks = [];
    // First chunk: already encrypted
    encryptedChunks.push(firstEncrypted.encrypted_message.toHex());
    // 4. Chain masking keys for subsequent chunks
    let prevMaskingKey = maskingKey0;
    for (let i = 1; i < transformed.length; i++) {
        // Derive masking key for this chunk from the previous one
        const maskingKey_i = prfMaskingKey(prevMaskingKey, i);
        // Encrypt: C_i = encode(m'_i) + maskingKey_i
        const encodedChunk = encode(babyJub.BASE, transformed[i]);
        const encryptedPoint = encodedChunk.add(maskingKey_i);
        encryptedChunks.push(encryptedPoint.toHex());
        prevMaskingKey = maskingKey_i;
    }
    return {
        ephemeral_key: ephemeralKey.toHex(),
        encrypted_chunks: encryptedChunks,
        original_byte_length: message.length,
    };
}
// =============================================================================
// AON Decrypt — Masking Key Chain variant
//
// ALL encrypted_chunks must be present and correct, or plaintext is garbage.
// =============================================================================
export function fullAONDecrypt(ciphertext, privKey) {
    const { ephemeral_key, encrypted_chunks, original_byte_length } = ciphertext;
    const ephemeralKeyPoint = babyJub.fromHex(ephemeral_key);
    // 1. Recover masking_key_0 = privKey · E_0 (the shared secret)
    const maskingKey0 = ephemeralKeyPoint.multiply(privKey);
    // 2. Decrypt first chunk: m'_0 = decode(C_0 - maskingKey_0)
    const C0 = babyJub.fromHex(encrypted_chunks[0]);
    const decryptedPoint0 = C0.add(maskingKey0.negate());
    const transformed = [];
    transformed.push(decode(babyJub.BASE, decryptedPoint0, CHUNK_BIT_SIZE));
    // 3. Chain masking keys and decrypt remaining chunks
    let prevMaskingKey = maskingKey0;
    for (let i = 1; i < encrypted_chunks.length; i++) {
        const maskingKey_i = prfMaskingKey(prevMaskingKey, i);
        const C_i = babyJub.fromHex(encrypted_chunks[i]);
        const decryptedPoint_i = C_i.add(maskingKey_i.negate());
        transformed.push(decode(babyJub.BASE, decryptedPoint_i, CHUNK_BIT_SIZE));
        prevMaskingKey = maskingKey_i;
    }
    // 4. Reverse the AONT to recover original plaintext chunks
    const originalChunks = aontReverse(transformed);
    // 5. Reconstruct the byte array
    return chunksToMessage(originalChunks, original_byte_length);
}
// =============================================================================
// Convenience: encrypt/decrypt from string
// =============================================================================
export function fullAONEncryptString(message, pubKey) {
    const encoder = new TextEncoder();
    return fullAONEncrypt(encoder.encode(message), pubKey);
}
export function fullAONDecryptString(ciphertext, privKey) {
    const bytes = fullAONDecrypt(ciphertext, privKey);
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
}
