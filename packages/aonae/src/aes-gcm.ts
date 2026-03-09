import { getSubtle, randomBytes } from "./crypto-env.js";

const IV_LENGTH = 12; // bytes — standard for GCM

// In TypeScript 5.7+ Uint8Array is generic over its buffer type. Web Crypto
// requires Uint8Array<ArrayBuffer>. Callers may supply plain Uint8Array
// (treated as Uint8Array<ArrayBufferLike>), so we cast at the call site.
// This is safe: our code never constructs SharedArrayBuffer-backed arrays.
function ab(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u as Uint8Array<ArrayBuffer>;
}

/**
 * Encrypt with AES-256-GCM.
 * Returns { ciphertext (includes auth tag), iv }.
 */
export async function encrypt(
  key: Uint8Array<ArrayBuffer>,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array<ArrayBuffer> }> {
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
    ab(plaintext)
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
  key: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array,
  iv: Uint8Array<ArrayBuffer>
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
    ab(ciphertext)
  );

  return new Uint8Array(decrypted);
}
