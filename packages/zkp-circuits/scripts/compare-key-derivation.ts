/**
 * compare-key-derivation.ts
 *
 * Compares three ways of deriving a Baby Jubjub public key from the same
 * raw private key material, to confirm whether the HE path and the signing
 * path are interchangeable or not.
 *
 * Run with:
 *   npx ts-node scripts/compare-key-derivation.ts
 */

import {
  genPubKey,
  formatPrivKeyForBabyJub,
  toBigIntArray,
  bigInt2Buffer,
} from "../src/utils/tools";
import * as zkeddsa from "@zk-kit/eddsa-poseidon";

// ---------------------------------------------------------------------------
// A fixed test private key — arbitrary, just needs to be stable
// ---------------------------------------------------------------------------
const TEST_SK_HEX =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const TEST_SK_BIGINT = BigInt(TEST_SK_HEX);

// ---------------------------------------------------------------------------
// Path 1: HE key derivation  (tools.ts genPubKey — blake2b + prune + shr3)
// ---------------------------------------------------------------------------

const hePublicKeyPoint = genPubKey(TEST_SK_BIGINT);
const [heX, heY] = toBigIntArray(hePublicKeyPoint);
const heScalar = formatPrivKeyForBabyJub(TEST_SK_BIGINT);

// ---------------------------------------------------------------------------
// Path 2: Signing key derivation  (@zk-kit/eddsa-poseidon — sha512 + prune + shr3)
// Note: zk-kit takes a Buffer/Uint8Array, matching what processor.ts does:
//   Buffer.from(BigInt(signingPrivateKey).toString(16), 'hex')
// ---------------------------------------------------------------------------

const skBuffer = bigInt2Buffer(TEST_SK_BIGINT);
const signingPublicKey = zkeddsa.derivePublicKey(skBuffer);
const signingScalar   = zkeddsa.deriveSecretScalar(skBuffer);
const [sigX, sigY]    = signingPublicKey as [bigint, bigint];

// ---------------------------------------------------------------------------
// Path 3: Registry's current (wrong) approach  — sk % ORDER * BASE8
// ---------------------------------------------------------------------------

import { twistedEdwards } from "@noble/curves/abstract/edwards";
import { Field }          from "@noble/curves/abstract/modular";
import { sha512 }         from "@noble/hashes/sha512";
import { randomBytes }    from "@noble/hashes/utils";

const Fp = Field(
  21888242871839275222246405745257275088548364400416034343698204186575808495617n
);
const ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;

const babyJubCurve = twistedEdwards({
  a: Fp.create(168700n),
  d: Fp.create(168696n),
  Fp,
  n: 21888242871839275222246405745257275088614511777268538073601725287587578984328n,
  h: 8n,
  Gx: 5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  Gy: 16950150798460657717958625567821834550301663161624707787222815936182638968203n,
  hash: sha512,
  randomBytes,
} as const);

const wrongScalar = ((TEST_SK_BIGINT % ORDER) + ORDER) % ORDER;
const wrongPoint  = babyJubCurve.ExtendedPoint.BASE.multiply(wrongScalar).toAffine();

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

console.log("=== Baby Jubjub key derivation comparison ===\n");

console.log("Private key (hex):");
console.log(" ", TEST_SK_HEX);
console.log();

console.log("── Path 1: HE key  (genPubKey → blake2b + prune + shr3 + BASE8)");
console.log("  scalar :", heScalar.toString());
console.log("  pk.x   :", heX.toString());
console.log("  pk.y   :", heY.toString());
console.log();

console.log("── Path 2: Signing key  (@zk-kit/eddsa-poseidon → sha512 + prune + shr3 + BASE8)");
console.log("  scalar :", signingScalar.toString());
console.log("  pk.x   :", sigX.toString());
console.log("  pk.y   :", sigY.toString());
console.log();

console.log("── Path 3: Registry current (WRONG) — sk % ORDER * BASE8");
console.log("  scalar :", wrongScalar.toString());
console.log("  pk.x   :", wrongPoint.x.toString());
console.log("  pk.y   :", wrongPoint.y.toString());
console.log();

// ---------------------------------------------------------------------------
// Conclusions
// ---------------------------------------------------------------------------

const heEqSigning = heX === sigX && heY === sigY;
const heEqWrong   = heX === wrongPoint.x && heY === wrongPoint.y;
const sigEqWrong  = sigX === wrongPoint.x && sigY === wrongPoint.y;

console.log("=== Conclusions ===");
console.log("HE key    == Signing key?", heEqSigning  ? "✅ SAME" : "❌ DIFFERENT");
console.log("HE key    == Wrong key?  ", heEqWrong    ? "✅ SAME" : "❌ DIFFERENT");
console.log("Signing   == Wrong key?  ", sigEqWrong   ? "✅ SAME" : "❌ DIFFERENT");
console.log();

if (!heEqSigning) {
  console.log("→ Confirmed: HE and signing derive DIFFERENT public keys from the same");
  console.log("  raw private key. Two separate derivation paths must be used.");
}
if (!heEqWrong && !sigEqWrong) {
  console.log("→ Confirmed: the registry's current sk%ORDER approach is wrong for both.");
}
