use lib::merkle_proof::{binary_merkle_root};
use lib::mimc::mimc_hash;

pub global DEPTH: u32 = 20; // or whatever depth you want (must be compile-time constant)

/// Hashes two fields using Poseidon



fn bits_to_index(bits: [u1; DEPTH]) -> Field {
    let mut acc: u32 = 0;
    let mut base: u32 = 1;

    for i in 0..DEPTH {
        let bit: u32 = bits[i] as u32;
        acc += bit * base;
        base *= 2;
    }

    dep::std::convert::From::<u32>::from(acc)
}
/// Verifies that a leaf is part of the Merkle tree defined by root and path


/// Main circuit: proves value_a, value_b produce a leaf which is in Merkle tree
#[export]
pub fn main(
    leaf_value: Field,
    root: Field,
    path: [Field; DEPTH],
    index_bits: [u1; DEPTH],
) -> pub (Field, Field, Field) {
    
    let computed_root = binary_merkle_root::<DEPTH>(mimc_hash, leaf_value, DEPTH, index_bits, path);

    assert(computed_root == root);
    (computed_root, leaf_value, bits_to_index(index_bits))
}
