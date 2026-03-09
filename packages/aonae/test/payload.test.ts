import { describe, it, expect } from "vitest";
import { serializePayload, deserializePayload } from "../src/payload.js";
import type { AONAEPayload, ProcessorPayload } from "../src/types.js";
import { randomBytes } from "../src/crypto-env.js";

function makePayload(overrides: Partial<AONAEPayload> = {}): AONAEPayload {
  return {
    content: new TextEncoder().encode("test content"),
    peerPayloads: [],
    signal: randomBytes(32),
    nonce: randomBytes(32),
    ...overrides,
  };
}

function makePeer(id: string): ProcessorPayload {
  return {
    processorId: id,
    ciphertexts: randomBytes(64),
    commitment: randomBytes(32),
    metadata: randomBytes(16),
  };
}

describe("payload serialization", () => {
  it("round-trips a minimal payload (no peers)", () => {
    const payload = makePayload();
    const serialized = serializePayload(payload);
    const recovered = deserializePayload(serialized);

    expect(Buffer.from(recovered.content).equals(Buffer.from(payload.content))).toBe(true);
    expect(recovered.peerPayloads.length).toBe(0);
    expect(Buffer.from(recovered.signal).equals(Buffer.from(payload.signal))).toBe(true);
    expect(Buffer.from(recovered.nonce).equals(Buffer.from(payload.nonce))).toBe(true);
  });

  it("round-trips a payload with multiple peers", () => {
    const peers = [makePeer("P1"), makePeer("P2"), makePeer("P3")];
    const payload = makePayload({ peerPayloads: peers });

    const serialized = serializePayload(payload);
    const recovered = deserializePayload(serialized);

    expect(recovered.peerPayloads.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(recovered.peerPayloads[i].processorId).toBe(peers[i].processorId);
      expect(Buffer.from(recovered.peerPayloads[i].ciphertexts)
        .equals(Buffer.from(peers[i].ciphertexts))).toBe(true);
      expect(Buffer.from(recovered.peerPayloads[i].commitment)
        .equals(Buffer.from(peers[i].commitment))).toBe(true);
      expect(Buffer.from(recovered.peerPayloads[i].metadata)
        .equals(Buffer.from(peers[i].metadata))).toBe(true);
    }
  });

  it("round-trips with empty content", () => {
    const payload = makePayload({ content: new Uint8Array(0) });
    const recovered = deserializePayload(serializePayload(payload));
    expect(recovered.content.length).toBe(0);
  });

  it("round-trips with empty peer fields", () => {
    const peer: ProcessorPayload = {
      processorId: "empty-peer",
      ciphertexts: new Uint8Array(0),
      commitment: new Uint8Array(0),
      metadata: new Uint8Array(0),
    };
    const payload = makePayload({ peerPayloads: [peer] });
    const recovered = deserializePayload(serializePayload(payload));
    expect(recovered.peerPayloads[0].processorId).toBe("empty-peer");
    expect(recovered.peerPayloads[0].ciphertexts.length).toBe(0);
  });

  it("round-trips with Unicode processor ID", () => {
    const peer = makePeer("processor-α-β-γ");
    const payload = makePayload({ peerPayloads: [peer] });
    const recovered = deserializePayload(serializePayload(payload));
    expect(recovered.peerPayloads[0].processorId).toBe("processor-α-β-γ");
  });

  it("round-trips with large content", () => {
    const content = randomBytes(4096);
    const payload = makePayload({ content });
    const recovered = deserializePayload(serializePayload(payload));
    expect(Buffer.from(recovered.content).equals(Buffer.from(content))).toBe(true);
  });

  it("serialized length is deterministic for the same payload", () => {
    const payload = makePayload({ peerPayloads: [makePeer("P1")] });
    const s1 = serializePayload(payload);
    const s2 = serializePayload(payload);
    expect(s1.length).toBe(s2.length);
  });
});
