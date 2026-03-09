import { describe, it, expect } from "vitest";
import { aontEncode, aontDecode } from "../src/aont.js";

describe("aont", () => {
  it("encode→decode round-trip for small payload", async () => {
    const plaintext = new TextEncoder().encode("hello world");
    const encoded = await aontEncode(plaintext);
    const decoded = await aontDecode(encoded);
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("encode→decode round-trip for exact block-multiple payload", async () => {
    // 32 bytes = exactly one block
    const plaintext = new Uint8Array(32).fill(0xab);
    const encoded = await aontEncode(plaintext);
    const decoded = await aontDecode(encoded);
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("encode→decode round-trip for multi-block payload", async () => {
    // 256 bytes = 8 blocks
    const plaintext = new Uint8Array(256);
    for (let i = 0; i < 256; i++) plaintext[i] = i;
    const encoded = await aontEncode(plaintext);
    const decoded = await aontDecode(encoded);
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("encode→decode round-trip for empty payload", async () => {
    const plaintext = new Uint8Array(0);
    // Empty plaintext gets padded to 1 block by AONT
    const encoded = await aontEncode(plaintext);
    const decoded = await aontDecode(encoded);
    expect(decoded.length).toBe(0);
  });

  it("encode→decode round-trip for large payload", async () => {
    const plaintext = new Uint8Array(1024);
    crypto.getRandomValues(plaintext);
    const encoded = await aontEncode(plaintext);
    const decoded = await aontDecode(encoded);
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("encoded output is larger than input (has length prefix + canary)", async () => {
    const plaintext = new Uint8Array(64).fill(1);
    const encoded = await aontEncode(plaintext);
    // 4 bytes length prefix + 64 bytes transformed + 32 bytes canary = 100 bytes
    expect(encoded.length).toBeGreaterThan(plaintext.length);
  });

  it("tampering with a transformed block corrupts the output", async () => {
    const plaintext = new TextEncoder().encode("sensitive data that must not be partially read");
    const encoded = await aontEncode(plaintext);

    // Flip a byte in the middle of the transformed blocks (after 4-byte length prefix)
    const tampered = new Uint8Array(encoded);
    tampered[10] ^= 0xff;

    const decoded = await aontDecode(tampered);
    // The canary will be corrupted → K_r will be wrong → all blocks will be wrongly decrypted
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(false);
  });

  it("tampering with the canary block corrupts the output", async () => {
    const plaintext = new TextEncoder().encode("canary tamper test");
    const encoded = await aontEncode(plaintext);

    // Flip a byte in the last 32 bytes (the canary)
    const tampered = new Uint8Array(encoded);
    tampered[encoded.length - 1] ^= 0xff;

    const decoded = await aontDecode(tampered);
    expect(Buffer.from(decoded).equals(Buffer.from(plaintext))).toBe(false);
  });
});
