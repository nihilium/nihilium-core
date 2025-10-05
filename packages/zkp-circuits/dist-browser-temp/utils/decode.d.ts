import { ExtPointType } from "@noble/curves/abstract/edwards";
declare function optimizedDecode(babyJubBase: ExtPointType, encoded: ExtPointType, precomputeSize: number): bigint;
declare function decode(babyJubBase: ExtPointType, encoded: ExtPointType, precomputeSize: number): bigint;
declare function encode(babyJubBase: ExtPointType, plaintext: bigint): ExtPointType;
declare function split64(x: bigint): [bigint, bigint];
export { decode, optimizedDecode, encode, split64 };
