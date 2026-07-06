
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const KeccakTreeEntryProof = new UnsealConditionProof({
    name: "Keccak Tree Entry Proof",
    addressMapKey: "KeccakTreeEntry",
    description: "Keccak Tree Entry Proof",
    version: "1.0.0",
    public_signals: {
        plain_value: [0, 1],
        tree_entry: [1, 1],
    },  
    complexity_score: 250_000,
});
