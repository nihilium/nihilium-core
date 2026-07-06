
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const SmallerThanProof = new UnsealConditionProof({
    name: "Smaller Than Proof",
    addressMapKey: "SmallerThan",
    description: "Smaller Than Proof",
    version: "1.0.0",
    public_signals: {
        timestamp: [0, 1],
        threshold: [1, 1],
    },
    complexity_score: 250_000,
});
