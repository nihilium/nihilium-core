import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../src/aes-gcm.js";
import { randomBytes } from "../src/crypto-env.js";

describe("aes-gcm", () => {
  it("encrypt→decrypt round-trip", async () => {
    const key = randomBytes(32);
    const plaintext = new TextEncoder().encode("hello AES-GCM");

    const { ciphertext, iv } = await encrypt(key, plaintext);
    const recovered = await decrypt(key, ciphertext, iv);

    expect(Buffer.from(recovered).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("ciphertext differs from plaintext", async () => {
    const key = randomBytes(32);
    const plaintext = new Uint8Array(32).fill(0x42);

    const { ciphertext } = await encrypt(key, plaintext);
    expect(Buffer.from(ciphertext).equals(Buffer.from(plaintext))).toBe(false);
  });

  it("IV is 12 bytes", async () => {
    const key = randomBytes(32);
    const { iv } = await encrypt(key, new Uint8Array(16));
    expect(iv.length).toBe(12);
  });

  it("ciphertext is plaintext length + 16 bytes auth tag", async () => {
    const key = randomBytes(32);
    const plaintext = new Uint8Array(32);
    const { ciphertext } = await encrypt(key, plaintext);
    expect(ciphertext.length).toBe(plaintext.length + 16);
  });

  it("wrong key throws on decrypt", async () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const plaintext = new TextEncoder().encode("secret");

    const { ciphertext, iv } = await encrypt(key, plaintext);

    await expect(decrypt(wrongKey, ciphertext, iv)).rejects.toThrow();
  });

  it("tampered ciphertext throws on decrypt", async () => {
    const key = randomBytes(32);
    const plaintext = new TextEncoder().encode("tamper me");

    const { ciphertext, iv } = await encrypt(key, plaintext);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;

    await expect(decrypt(key, tampered, iv)).rejects.toThrow();
  });

  it("wrong IV throws on decrypt", async () => {
    const key = randomBytes(32);
    const plaintext = new TextEncoder().encode("iv test");

    const { ciphertext } = await encrypt(key, plaintext);
    const wrongIV = randomBytes(12);

    await expect(decrypt(key, ciphertext, wrongIV)).rejects.toThrow();
  });

  it("encrypt produces different IV each call", async () => {
    const key = randomBytes(32);
    const plaintext = new Uint8Array(16);

    const a = await encrypt(key, plaintext);
    const b = await encrypt(key, plaintext);

    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
  });
});
