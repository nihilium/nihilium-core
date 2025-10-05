use lib::merkle_proof::{binary_merkle_root};
use lib::mimc::mimc_hash;

pub global MAX_DEPTH: u32 = 20; // or whatever depth you want (must be compile-time constant)

/// Main circuit: proves value_a, value_b produce a leaf which is in Merkle tree
#[export]
pub fn main(
    leaf_value: Field,
    root: Field,
    depth: u32,
    path: [Field; MAX_DEPTH],
    index_bits: [u1; MAX_DEPTH],
) -> pub (Field, Field) {
    
    let computed_root = binary_merkle_root::<MAX_DEPTH>(mimc_hash, leaf_value, depth, index_bits, path);

    assert(computed_root == root);
    (computed_root, leaf_value)
}
