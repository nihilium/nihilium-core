
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const TimeDelayProof = new UnsealConditionProof({
    name: "Time Delay Proof",
    addressMapKey: "TimeDelayProof",
    description: "Time Delay Proof",
    version: "1.0.0",
    public_signals: {
        timestamp_low: [0, 1],
        timestamp_high: [1, 1],
        offset: [2, 1],
    },
});
