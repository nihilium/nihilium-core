
import {  UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const UnsealOpeningProof = new UnsealConditionProof({
    name: "UnsealOpeningProof",
    addressMapKey: "opening_proof",
    description: "The base opening proof for everything Nihilium.",
    version: "1.0.0",
    public_signals: {
        reveal_value: [0, 1],
        unseal_condition_root_commit: [1, 1],
        metadata_root_hash: [2, 1],
        ephemeralKey_he: [3, 16],
        point_he: [19, 16],
        publicKey_validated: [35, 2],
        publicKeyHe_validated: [37, 2],
        newCombinedPublicKey: [39, 2],
    },
    complexity_score: 250_000,
});
