import { UnsealConditionProof } from "../types";

/**
 * Proves that a value-tree root is a leaf in the dual accumulator tree.
 * Reuses the existing MerkleTreeProof contract (standard binary keccak Merkle proof).
 *
 * Public signals:
 *   [0] merkle_root  — current dual tree root (anchored on-chain via isKnownDualRoot)
 *   [1] leaf_value   — the value-tree root being proven
 *   [2] index        — position of this value-tree root in the dual tree
 */
export const DualTreeProof = new UnsealConditionProof({
    name: "Dual Tree Proof",
    addressMapKey: "MerkleTreeProof",
    description: "Proves a value-tree root is a leaf in the dual accumulator tree",
    version: "1.0.0",
    public_signals: {
        merkle_root: [0, 1],
        leaf_value:  [1, 1],
        index:       [2, 1],
    },
    complexity_score: 250_000,
});
