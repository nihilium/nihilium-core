import { AffinePoint } from "@noble/curves/abstract/curve";
import { ExtPointType } from "@noble/curves/abstract/edwards";
export type SnarkBigInt = bigint;
export type PrivKey = bigint;
export type PubKey = ExtPointType;
export type BabyJubAffinePoint = AffinePoint<bigint>;
export type BabyJubExtPoint = ExtPointType;
export declare const babyJubNoble: import("@noble/curves/abstract/edwards").CurveFn;
/**
 * A private key and a public key
 */
export interface Keypair {
    privKey: PrivKey;
    pubKey: PubKey;
}
export declare const SNARK_FIELD_SIZE: SnarkBigInt;
export declare const babyJub: import("@noble/curves/abstract/edwards").ExtPointConstructor;
