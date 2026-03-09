import { describe, it, expect } from "vitest";
import { verifySignal } from "../src/signal.js";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "../src/crypto-env.js";
import type { SignalCommitment } from "../src/types.js";

describe("signal", () => {
  it("verifySignal returns true for matching signal", () => {
    const signal = randomBytes(32);
    const commitment: SignalCommitment = {
      processorId: "P1",
      commitment: sha256(signal),
    };
    expect(verifySignal(signal, commitment)).toBe(true);
  });

  it("verifySignal returns false for wrong signal", () => {
    const signal = randomBytes(32);
    const wrongSignal = randomBytes(32);
    const commitment: SignalCommitment = {
      processorId: "P1",
      commitment: sha256(signal),
    };
    expect(verifySignal(wrongSignal, commitment)).toBe(false);
  });

  it("verifySignal returns false for zero signal against real commitment", () => {
    const signal = randomBytes(32);
    const commitment: SignalCommitment = {
      processorId: "P1",
      commitment: sha256(signal),
    };
    expect(verifySignal(new Uint8Array(32), commitment)).toBe(false);
  });

  it("verifySignal returns false for mismatched commitment length", () => {
    const signal = randomBytes(32);
    const commitment: SignalCommitment = {
      processorId: "P1",
      commitment: new Uint8Array(16), // wrong length
    };
    expect(verifySignal(signal, commitment)).toBe(false);
  });

  it("verifySignal is deterministic", () => {
    const signal = randomBytes(32);
    const commitment: SignalCommitment = {
      processorId: "P1",
      commitment: sha256(signal),
    };
    expect(verifySignal(signal, commitment)).toBe(true);
    expect(verifySignal(signal, commitment)).toBe(true);
  });

  it("different processor IDs do not affect signal verification", () => {
    const signal = randomBytes(32);
    const hash = sha256(signal);
    const c1: SignalCommitment = { processorId: "P1", commitment: hash };
    const c2: SignalCommitment = { processorId: "P2", commitment: hash };
    // Commitment is just H(signal), processor ID is metadata only
    expect(verifySignal(signal, c1)).toBe(true);
    expect(verifySignal(signal, c2)).toBe(true);
  });
});
