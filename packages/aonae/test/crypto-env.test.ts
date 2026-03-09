import { describe, it, expect } from "vitest";
import { getSubtle, randomBytes } from "../src/crypto-env.js";

describe("crypto-env", () => {
  it("randomBytes returns the requested length", () => {
    for (const n of [1, 16, 32, 64, 128]) {
      const buf = randomBytes(n);
      expect(buf).toBeInstanceOf(Uint8Array);
      expect(buf.length).toBe(n);
    }
  });

  it("randomBytes returns different values on successive calls", () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    // With overwhelming probability two random 32-byte values differ
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("getSubtle returns a SubtleCrypto object", () => {
    const subtle = getSubtle();
    expect(subtle).toBeDefined();
    expect(typeof subtle.importKey).toBe("function");
    expect(typeof subtle.encrypt).toBe("function");
    expect(typeof subtle.decrypt).toBe("function");
  });
});
