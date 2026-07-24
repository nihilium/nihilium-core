import { expect } from "chai";
import { babyJub, PubKey } from "../src/utils/types";
import { generateRandom248BitNumber } from "../src/utils/tools";
import { FDTEncrypt, FDTDecrypt, FDTSealedPackage } from "../src/utils/dte_hard";

const G = babyJub.BASE;

// Threshold configurations exercised. m=1 collapses to a plain single-lane
// combinatorial threshold; m>1 exercises the m^k path search.
const configs = [
  { n: 6, k: 3, m: 4 },
  { n: 5, k: 5, m: 3 },
  { n: 4, k: 3, m: 1 },
];

describe("FDT combinatorial threshold (search-width m)", () => {
  for (const { n, k, m } of configs) {
    describe(`n=${n} k=${k} m=${m}`, () => {
      let privateKeys: bigint[];
      let message: bigint;
      let sealed: FDTSealedPackage;
      let qualifying: bigint[]; // a random qualifying k-subset

      before(() => {
        privateKeys = Array.from({ length: n }, () => generateRandom248BitNumber());
        const pubKeys: PubKey[] = privateKeys.map((sk) => G.multiply(sk));
        message = generateRandom248BitNumber();
        sealed = FDTEncrypt(message, pubKeys, k, m);
        qualifying = [...privateKeys].sort(() => Math.random() - 0.5).slice(0, k);
      });

      it(`seals C(${n},${k}) combinations`, () => {
        expect(Object.keys(sealed.combinations).length).to.equal(binomial(n, k));
        expect(sealed.m).to.equal(m);
        expect(sealed.threshold).to.equal(k);
      });

      it("recovers the message with a qualifying k-subset", () => {
        expect(FDTDecrypt(qualifying, sealed)).to.equal(message.toString());
      });

      it("recovers with any qualifying k-subset (combinatorial availability)", () => {
        const other = [...privateKeys].sort(() => Math.random() - 0.5).slice(0, k);
        expect(FDTDecrypt(other, sealed)).to.equal(message.toString());
      });

      it("rejects a below-threshold (k-1) subset", () => {
        expect(() => FDTDecrypt(qualifying.slice(0, k - 1), sealed)).to.throw();
      });

      it("rejects a subset containing an external (non-pool) key", () => {
        const external = generateRandom248BitNumber();
        const subset = [...qualifying.slice(0, k - 1), external];
        // Either no combination matches (throws) or it decrypts to something else.
        let recovered: string | null = null;
        try {
          recovered = FDTDecrypt(subset, sealed);
        } catch {
          recovered = null;
        }
        expect(recovered).to.not.equal(message.toString());
      });
    });
  }
});

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}
