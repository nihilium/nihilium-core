import { expect } from "chai";
import { babyJub, PubKey } from "../src/utils/types";
import { generateRandom248BitNumber } from "../src/utils/tools";
import {
  provePartialDecryption,
  attributePartialDecryption,
  attributeCombinedPartial,
  serializePartial,
  deserializePartial,
  AttributablePartial,
} from "../src/utils/dleq";

const G = babyJub.BASE;

describe("DLEQ partial-decryption attribution", () => {
  describe("single-key partial", () => {
    let sk: bigint;
    let pk: PubKey;
    let ek: PubKey;
    let partial: AttributablePartial;

    beforeEach(() => {
      sk = generateRandom248BitNumber();
      pk = G.multiply(sk);
      ek = G.multiply(generateRandom248BitNumber()); // ciphertext ephemeral r·G
      partial = provePartialDecryption(sk, ek);
    });

    it("attributes an honest partial to its public key", () => {
      expect(attributePartialDecryption(pk, ek, partial)).to.be.true;
    });

    it("produces D = sk·ek", () => {
      expect(partial.D.equals(ek.multiply(sk))).to.be.true;
    });

    it("rejects a wrong public key", () => {
      const otherPk = G.multiply(generateRandom248BitNumber());
      expect(attributePartialDecryption(otherPk, ek, partial)).to.be.false;
    });

    it("rejects a wrong ephemeral", () => {
      const otherEk = G.multiply(generateRandom248BitNumber());
      expect(attributePartialDecryption(pk, otherEk, partial)).to.be.false;
    });

    it("rejects a tampered D", () => {
      const tampered = { ...partial, D: ek.multiply(generateRandom248BitNumber()) };
      expect(attributePartialDecryption(pk, ek, tampered)).to.be.false;
    });

    it("rejects a tampered proof", () => {
      const tampered = { ...partial, proof: { ...partial.proof, z: partial.proof.z + 1n } };
      expect(attributePartialDecryption(pk, ek, tampered)).to.be.false;
    });

    it("survives a serialisation round-trip", () => {
      const roundTripped = deserializePartial(serializePartial(partial));
      expect(attributePartialDecryption(pk, ek, roundTripped)).to.be.true;
    });
  });

  describe('composite "4 and 1" partial (lane combines 5 keys)', () => {
    // A ciphertext under pk_combo = pk_1 + ... + pk_5; shared secret S = Σ sk_i·ek.
    // One party strips 4 layers, another does the remaining 1.
    let pks: PubKey[];
    let ek: PubKey;
    let S: PubKey;
    let pk4: PubKey;
    let partial4: AttributablePartial; // D4 = (sk_1+..+sk_4)·ek
    let partial1: AttributablePartial; // D1 = sk_5·ek

    before(() => {
      const sks = Array.from({ length: 5 }, () => generateRandom248BitNumber());
      pks = sks.map((sk) => G.multiply(sk));
      const pkCombo = pks.reduce((a, b) => a.add(b));

      const r = generateRandom248BitNumber();
      ek = G.multiply(r);
      S = pkCombo.multiply(r);

      pk4 = pks[0].add(pks[1]).add(pks[2]).add(pks[3]);
      partial4 = provePartialDecryption(sks[0] + sks[1] + sks[2] + sks[3], ek);
      partial1 = provePartialDecryption(sks[4], ek);
    });

    it("attributes the 4-combined partial to the sum of those 4 keys", () => {
      expect(attributePartialDecryption(pk4, ek, partial4)).to.be.true;
    });

    it("attributes the remaining 1-key partial to that operator", () => {
      expect(attributePartialDecryption(pks[4], ek, partial1)).to.be.true;
    });

    it("reconstructs the full shared secret from the two partials", () => {
      expect(partial4.D.add(partial1.D).equals(S)).to.be.true;
    });

    it("does not cross-attribute a partial to the wrong key set", () => {
      expect(attributePartialDecryption(pks[4], ek, partial4)).to.be.false;
      expect(attributePartialDecryption(pk4, ek, partial1)).to.be.false;
    });
  });

  describe("recovering which subset produced a combined partial", () => {
    let sks: bigint[];
    let pks: PubKey[];
    let ek: PubKey;

    beforeEach(() => {
      sks = Array.from({ length: 5 }, () => generateRandom248BitNumber());
      pks = sks.map((sk) => G.multiply(sk));
      ek = G.multiply(generateRandom248BitNumber());
    });

    it("recovers the exact subset that produced the partial", () => {
      const trueSubset = [0, 2, 4];
      const x = trueSubset.reduce((acc, i) => acc + sks[i], 0n);
      const partial = provePartialDecryption(x, ek);

      const found = attributeCombinedPartial(pks, ek, partial);
      expect(found).to.not.be.null;
      expect(found!.slice().sort((a, b) => a - b)).to.deep.equal(trueSubset);
    });

    it("attributes a single-key partial to one operator", () => {
      const partial = provePartialDecryption(sks[1], ek);
      expect(attributeCombinedPartial(pks, ek, partial)).to.deep.equal([1]);
    });

    it("returns null for a partial masked with a non-registered key", () => {
      const foreign = generateRandom248BitNumber();
      const masked = provePartialDecryption(sks[0] + sks[3] + foreign, ek);
      expect(attributeCombinedPartial(pks, ek, masked)).to.be.null;
    });
  });
});
