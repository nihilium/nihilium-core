
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const AdditionProof = new UnsealConditionProof({
    name: "Addition Proof",
    addressMapKey: "AdditionProof",
    description: "Addition Proof",
    version: "1.0.0",
    public_signals: {
        value1: [0, 1],
        value2: [1, 1],
        result: [2, 1],
    },
    complexity_score: 250_000,
});
