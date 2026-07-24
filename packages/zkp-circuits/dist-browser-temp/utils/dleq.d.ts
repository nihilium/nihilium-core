import { PubKey, PrivKey } from "./types";
export interface DLEQProof {
    c: bigint;
    z: bigint;
}
/**
 * Chaum-Pedersen DLEQ: prove one secret x satisfies P1 = x·B1 AND P2 = x·B2,
 * without revealing x. For partial-decryption attribution use B1 = G (so P1 = pk)
 * and B2 = ek (so P2 = D).
 */
export declare function proveDLEQ(x: bigint, B1: PubKey, B2: PubKey): DLEQProof;
/**
 * Verify a Chaum-Pedersen DLEQ proof that the discrete logs of P1 (base B1) and
 * P2 (base B2) are equal. Returns false for any malformed or invalid proof.
 */
export declare function verifyDLEQ(B1: PubKey, P1: PubKey, B2: PubKey, P2: PubKey, proof: DLEQProof): boolean;
export interface AttributablePartial {
    D: PubKey;
    proof: DLEQProof;
}
/**
 * Produce an attributable partial decryption of ephemeral key ek under sk:
 * D = sk·ek together with a DLEQ proof binding D to pk = sk·G. `sk` may be a
 * single private key or the sum of several (for a layer-stripping partial).
 */
export declare function provePartialDecryption(sk: PrivKey, ek: PubKey): AttributablePartial;
/**
 * Attribute a partial decryption to a public key: returns true iff D is the
 * partial decryption sk·ek produced by the holder of pk = sk·G. This is the
 * on-chain slashing check — feed it the surfaced partial D, the public ephemeral
 * ek, the registered pk, and the proof (whitepaper §8.2).
 */
export declare function attributePartialDecryption(pk: PubKey, ek: PubKey, partial: AttributablePartial): boolean;
/**
 * Recover WHICH subset of candidate keys produced a combined partial decryption,
 * attributing it to all of its constituents. The DLEQ proof validates against
 * exactly one public key — the sum x·G of the secret the prover used — so we
 * enumerate subsets, sum their public keys, and return the one whose sum the proof
 * accepts. Uses only public data (candidate keys, ephemeral, partial + proof); no
 * ephemeral secret and no DDH break required, because the proof carries the DH
 * witness.
 *
 * Returns the matching candidate indices, or null if no subset of the candidates
 * accounts for the partial — e.g. an additive mask that folds in a non-candidate
 * key (the honest protocol's composite structure is designed to prevent that, and
 * the sealing-time membership proof records the true subset so this brute force is
 * only a fallback). Soundness: a validating subset is unforgeable evidence, since
 * producing the proof requires knowing the sum of that subset's private keys.
 *
 * Cost is exponential in the candidate count (2^n subset tests); intended for the
 * small candidate sets of a single combination. Throws above `maxCandidates`.
 */
export declare function attributeCombinedPartial(candidatePubKeys: PubKey[], ek: PubKey, partial: AttributablePartial, opts?: {
    minSize?: number;
    maxCandidates?: number;
}): number[] | null;
export interface SerializedPartial {
    D: string;
    c: string;
    z: string;
}
export declare function serializePartial(partial: AttributablePartial): SerializedPartial;
export declare function deserializePartial(s: SerializedPartial): AttributablePartial;
