import { describe, it, expect } from "vitest";
import { seal, unseal, unsealAsProcessor } from "../src/aonae.js";
import { verifySignal } from "../src/signal.js";
import { generateKeypair } from "../src/bjj-ecdh.js";
import type { ProcessorPayload, Argon2Params } from "../src/types.js";
import { randomBytes } from "../src/crypto-env.js";

// Fast params for testing — 1 MB, 1 iteration
const TEST_PARAMS: Argon2Params = {
  memory: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

function makePeer(id: string): ProcessorPayload {
  return {
    processorId: id,
    ciphertexts: randomBytes(32),
    commitment: randomBytes(32),
    metadata: randomBytes(16),
  };
}

describe("aonae", () => {
  it("seal returns ciphertext and signal commitment", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("test content");

    const result = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);

    expect(result.ciphertext).toBeDefined();
    expect(result.ciphertext.ciphertext).toBeInstanceOf(Uint8Array);
    expect(result.ciphertext.iv.length).toBe(12);
    expect(result.ciphertext.salt.length).toBe(32);
    expect(result.signalCommitment.processorId).toBe("P1");
    expect(result.signalCommitment.commitment.length).toBe(32);
  });

  it("seal → unseal round-trip recovers content", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("secret document contents");

    const { ciphertext } = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);
    const payload = await unseal(ciphertext, sealedKey.privateKey);

    expect(new TextDecoder().decode(payload.content)).toBe("secret document contents");
  });

  it("seal → unseal preserves peer payloads", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("data");
    const peers = [makePeer("P2"), makePeer("P3")];

    const { ciphertext } = await seal(content, peers, sealedKey.publicKey, "P1", TEST_PARAMS);
    const payload = await unseal(ciphertext, sealedKey.privateKey);

    expect(payload.peerPayloads.length).toBe(2);
    expect(payload.peerPayloads[0].processorId).toBe("P2");
    expect(payload.peerPayloads[1].processorId).toBe("P3");
    expect(Buffer.from(payload.peerPayloads[0].ciphertexts)
      .equals(Buffer.from(peers[0].ciphertexts))).toBe(true);
  });

  it("unseal with wrong key fails", async () => {
    const sealedKey = await generateKeypair();
    const wrongKey = await generateKeypair();
    const content = new TextEncoder().encode("secret");

    const { ciphertext } = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);

    await expect(unseal(ciphertext, wrongKey.privateKey)).rejects.toThrow();
  });

  it("signal commitment is verifiable after seal", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("data");

    const { ciphertext, signalCommitment } = await seal(
      content, [], sealedKey.publicKey, "P1", TEST_PARAMS
    );

    // Unseal to get the signal token
    const payload = await unseal(ciphertext, sealedKey.privateKey);

    // Verify the signal against the commitment
    const isVerified = verifySignal(payload.signal, signalCommitment);
    expect(isVerified).toBe(true);
  });

  it("seal → unsealAsProcessor: processor recovers full payload", async () => {
    // In the simplified test: K1 = full key, K2 = 0 (so KF = K1 + 0 = K1)
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("processor sees all");
    const peers = [makePeer("P2")];

    const { ciphertext } = await seal(content, peers, sealedKey.publicKey, "P1", TEST_PARAMS);

    const processorResult = await unsealAsProcessor(
      ciphertext,
      sealedKey.privateKey,
      new Uint8Array(32), // K2 = 0
    );

    expect(new TextDecoder().decode(processorResult.payload.content)).toBe("processor sees all");
    expect(processorResult.peerPayloads.length).toBe(1);
    expect(processorResult.signal.length).toBe(32);
  });

  it("signal from unsealAsProcessor matches commitment", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("signal test");

    const { ciphertext, signalCommitment } = await seal(
      content, [], sealedKey.publicKey, "P1", TEST_PARAMS
    );

    const processorResult = await unsealAsProcessor(
      ciphertext,
      sealedKey.privateKey,
      new Uint8Array(32),
    );

    // An observer can verify the signal the processor publishes
    expect(verifySignal(processorResult.signal, signalCommitment)).toBe(true);
  });

  it("tampered ciphertext causes unseal to throw", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("tamper test");

    const { ciphertext } = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);

    // Tamper with the ciphertext bytes
    const tampered = { ...ciphertext, ciphertext: new Uint8Array(ciphertext.ciphertext) };
    tampered.ciphertext[0] ^= 0xff;

    await expect(unseal(tampered, sealedKey.privateKey)).rejects.toThrow();
  });

  it("each seal produces a unique ciphertext", async () => {
    const sealedKey = await generateKeypair();
    const content = new TextEncoder().encode("same content");

    const r1 = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);
    const r2 = await seal(content, [], sealedKey.publicKey, "P1", TEST_PARAMS);

    // Different ephemeral keys → different ciphertexts
    expect(
      Buffer.from(r1.ciphertext.ciphertext).equals(Buffer.from(r2.ciphertext.ciphertext))
    ).toBe(false);
  });
});
