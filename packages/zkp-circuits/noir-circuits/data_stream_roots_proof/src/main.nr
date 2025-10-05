use lib::merkle_proof::{binary_merkle_root};
use lib::mimc::mimc_hash;
use lib::constants::powers_of_two;

pub global MAX_TREE_DEPTH: u32 = 20; // or whatever depth you want (must be compile-time constant)
pub global LEAFS_TO_PROOF: u32 = 64;
pub global LEAFS_TO_PROOF_DEPTH: u32 = 6; // 64 = 2^6

/// Main circuit: proves value_a, value_b produce a leaf which is in Merkle tree
#[export]
pub fn main(
    leaf_values: [Field; LEAFS_TO_PROOF],
    timestamps: [Field; LEAFS_TO_PROOF],
    old_roots: [Field; LEAFS_TO_PROOF],
    value_root: Field,
    merkle_root: Field,
    value_path: [Field; MAX_TREE_DEPTH],
    value_index_bits: [u1; MAX_TREE_DEPTH],
    merkle_path: [Field; MAX_TREE_DEPTH],
    merkle_index_bits: [u1; MAX_TREE_DEPTH],
) -> pub (Field, Field, Field, [Field; LEAFS_TO_PROOF]) {
    let leaf = mimc_hash([leaf_values[LEAFS_TO_PROOF - 1], timestamps[LEAFS_TO_PROOF - 1]]);

    //Hash all old roots like a merkle tree of 6 depth
    let mut old_roots_hashed: [Field; LEAFS_TO_PROOF] = [0; LEAFS_TO_PROOF];
    for i in 0..(LEAFS_TO_PROOF ) {
        
        // let mut value_leafs: [Field; ] = [0; u32(2).pow(LEAFS_TO_PROOF_DEPTH)];
        old_roots_hashed[i] = mimc_hash([leaf_values[i], timestamps[i]]);
    }

    //Hash all leaf values like a merkle tree of 6 depth


    let computed_value_root = binary_merkle_root::<MAX_TREE_DEPTH>(mimc_hash, leaf, MAX_TREE_DEPTH, value_index_bits, value_path);
    let computed_merkle_root = binary_merkle_root::<MAX_TREE_DEPTH>(mimc_hash, old_roots[LEAFS_TO_PROOF - 1], MAX_TREE_DEPTH, merkle_index_bits, merkle_path);

    assert(computed_value_root == value_root);
    assert(computed_merkle_root == merkle_root);
    (leaf, computed_value_root, computed_merkle_root, leaf_values)
}
