import { AffinePoint } from "@noble/curves/abstract/curve";



import { twistedEdwards } from "@noble/curves/abstract/edwards";
import { Field } from "@noble/curves/abstract/modular";
import { sha512 } from "@noble/hashes/sha512";
import { randomBytes } from "@noble/hashes/utils";
import * as assert from "assert";

import { ExtPointType } from "@noble/curves/abstract/edwards";

export type SnarkBigInt = bigint;
export type PrivKey = bigint;
export type PubKey = ExtPointType;
export type BabyJubAffinePoint = AffinePoint<bigint>;
export type BabyJubExtPoint = ExtPointType;

//const curve = twistedEdwards({ a, d, Fp: Field(p), n, Gx, Gy, h })
//const curve = twistedEdwards({ a, d, Fp: Field(p), n, Gx, Gy, h })
const Fp = Field(21888242871839275222246405745257275088548364400416034343698204186575808495617n);
export const babyJubNoble = twistedEdwards({
    a: Fp.create(168700n),
    d: Fp.create(168696n),
    Fp: Fp,
    n: 21888242871839275222246405745257275088614511777268538073601725287587578984328n,
    h: 8n,
    Gx: 5299619240641551281634865583518297030282874472190772894086521144482721001553n,
    Gy: 16950150798460657717958625567821834550301663161624707787222815936182638968203n,
    hash: sha512,
    randomBytes,
} as const);

// export const customGeneratorPoint = babyJubNoble.ExtendedPoint.fromAffine({
//     x: 995203441582195749578291179787384436505546430278305826713579947235728471134n,
//     y: 5472060717959818805561601436314318772137091100104008585924551046643952123905n,
// });
/**
 * A private key and a public key
 */
export interface Keypair {
    privKey: PrivKey;
    pubKey: PubKey;
}

// The BN254 group order p
export const SNARK_FIELD_SIZE: SnarkBigInt = BigInt(
    "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
// Textbook Elgamal Encryption Scheme over Baby Jubjub curve without message encoding
export const babyJub = babyJubNoble.ExtendedPoint;
