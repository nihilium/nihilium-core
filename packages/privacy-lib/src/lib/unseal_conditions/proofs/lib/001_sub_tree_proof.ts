
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const SubTreeProof = new UnsealConditionProof({
    name: "Sub Tree Proof",
    addressMapKey: "SubTreeMerkleProof",
    description: "Sub Tree Proof",
    version: "1.0.0",
    public_signals: {
        computed_root: [0, 1],
        leaf_value: [1, 1],
        index: [2, 1],
    },
});
