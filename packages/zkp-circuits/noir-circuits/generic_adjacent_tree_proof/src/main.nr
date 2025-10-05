use lib::merkle_proof::{binary_merkle_root};
use lib::mimc::mimc_hash;

pub global MAX_DEPTH: u32 = 20; // or whatever depth you want (must be compile-time constant)

fn bits_to_index(bits: [u1; MAX_DEPTH]) -> u32 {
    let mut acc: u32 = 0;
    let mut base: u32 = 1;

    for i in 0..MAX_DEPTH {
        let bit: u32 = bits[i] as u32;
        acc += bit * base;
        base *= 2;
    }

    acc
}
/// Main circuit: proves value_a, value_b produce a leaf which is in Merkle tree
#[export]
pub fn main(
    leaf_value: Field,
    root: Field,
    depth: u32,
    original_index: u32,
    path: [Field; MAX_DEPTH],
    index_bits: [u1; MAX_DEPTH],
) -> pub (Field, Field, u32, u32, u32) {
    
    let computed_root = binary_merkle_root::<MAX_DEPTH>(mimc_hash, leaf_value, depth, index_bits, path);
    let new_index = bits_to_index(index_bits);
    assert(computed_root == root);
    assert(new_index > original_index);
    let offset = new_index - original_index;
    (computed_root, leaf_value, original_index, new_index, offset)
}
