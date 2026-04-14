
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const ManualChoiceProof = new UnsealConditionProof({
    name: "Manual Choice Proof",
    addressMapKey: "ManualChoiceProof",
    description: "Manual Choice Proof",
    version: "1.0.0",
    public_signals: {
        choice: [0, 1],
    },
});
