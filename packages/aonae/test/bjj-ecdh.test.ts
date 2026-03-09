import { describe, it, expect } from "vitest";
import { generateKeypair, ecdh, getBJJ } from "../src/bjj-ecdh.js";

describe("bjj-ecdh", () => {
  it("generateKeypair returns 32-byte private key and BJJ point", async () => {
    const kp = await generateKeypair();
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(Array.isArray(kp.publicKey)).toBe(true);
    expect(kp.publicKey.length).toBe(2);
    expect(typeof kp.publicKey[0]).toBe("bigint");
    expect(typeof kp.publicKey[1]).toBe("bigint");
  });

  it("successive keypairs have different private keys", async () => {
    const a = await generateKeypair();
    const b = await generateKeypair();
    expect(Buffer.from(a.privateKey).equals(Buffer.from(b.privateKey))).toBe(false);
  });

  it("ECDH is symmetric: a·B == b·A", async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();

    const sharedAB = await ecdh(alice.privateKey, bob.publicKey);
    const sharedBA = await ecdh(bob.privateKey, alice.publicKey);

    expect(Buffer.from(sharedAB).equals(Buffer.from(sharedBA))).toBe(true);
  });

  it("ECDH shared secret is 32 bytes", async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const shared = await ecdh(alice.privateKey, bob.publicKey);
    expect(shared.length).toBe(32);
  });

  it("different keypairs produce different shared secrets", async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const carol = await generateKeypair();

    const sharedAB = await ecdh(alice.privateKey, bob.publicKey);
    const sharedAC = await ecdh(alice.privateKey, carol.publicKey);

    expect(Buffer.from(sharedAB).equals(Buffer.from(sharedAC))).toBe(false);
  });

  it("getBJJ returns the singleton BabyJub instance", async () => {
    const bjj1 = await getBJJ();
    const bjj2 = await getBJJ();
    expect(bjj1).toBe(bjj2); // same reference
    expect(bjj1.subOrder).toBeDefined();
    expect(bjj1.Base8).toBeDefined();
  });
});
