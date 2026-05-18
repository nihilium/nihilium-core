
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const GreaterOrEqualThenProof = new UnsealConditionProof({
    name: "Greater Or Equal Then Proof",
    addressMapKey: "GreaterOrEqualThen",
    description: "Greater Or Equal Then Proof",
    version: "1.0.0",
    public_signals: {
        timestamp: [0, 1],
        threshold: [1, 1],
    },
});
