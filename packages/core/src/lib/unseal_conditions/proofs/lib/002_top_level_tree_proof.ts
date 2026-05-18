
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const TopLevelTreeProof = new UnsealConditionProof({
    name: "Top Level Tree Proof",
    addressMapKey: "TopLevelMerkleProof",
    description: "Top Level Tree Proof",
    version: "1.0.0",
    public_signals: {
        merkle_root: [0, 1],
        block_timestamp: [1, 1],
        subtree_root: [2, 1],
        index: [3, 1],
    },
});
