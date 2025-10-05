use poseidon::poseidon::bn254::{hash_2};
use poseidon::poseidon::PoseidonHasher;


pub fn hash_pair(left: Field, right: Field) -> Field {
    hash_2([left, right])
}

pub fn verify_merkle_proof_20(leaf: Field, path: [Field; 20], index_bits: [bool; 20]) -> Field {
    let mut current = leaf;

    for i in 0..20 {
        let sibling = path[i];

        current = if index_bits[i] {
            hash_pair(sibling, current) // current is right
        } else {
            hash_pair(current, sibling) // current is left
        };
    }

    current
}

pub fn binary_merkle_root<let MAX_DEPTH: u32>(
    hasher: fn([Field; 2]) -> Field,
    leaf: Field,
    depth: u32,
    indices: [u1; MAX_DEPTH],
    siblings: [Field; MAX_DEPTH],
) -> Field {
    // Start from the leaf node
    let mut node = leaf;

    // Iterate through the Merkle proof up to MAX_DEPTH
    for i in 0..MAX_DEPTH {
        // Only compute hash if the current level is within the tree depth
        if i < depth {
            let sibling = siblings[i];

            // Determine the ordering of node and sibling based on the index bit
            // If indices[i] == 0, node is on the left; otherwise, it's on the right
            let (left, right) = if indices[i] == 0 {
                (node, sibling)
            } else {
                (sibling, node)
            };

            // Hash the pair to move one level up the tree
            node = hasher([left, right]);
        }
    }

    // Return the root computed
    node
}