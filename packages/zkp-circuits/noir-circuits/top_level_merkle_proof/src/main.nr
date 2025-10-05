use lib::merkle_proof::{binary_merkle_root};
use lib::mimc::mimc_hash;
use keccak256;

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
fn hash_keccak256(p1: [Field; 2]) -> Field {
    // 1) Convert each Field to a fixed-length byte array.
    //    Here we choose big-endian; adjust N to your field size (e.g. 32 or 8).
    let x_bytes: [u8; 32] = p1[0].to_be_bytes();
    let y_bytes: [u8; 32] = p1[1].to_be_bytes();

    // 2) Concatenate into one 64-byte array
    let mut data: [u8; 64] = [0; 64];
    // copy x_bytes into data[0..32]
    for i in 0..32 {
        data[i] = x_bytes[i];
    }
    // copy y_bytes into data[32..64]
    for i in 0..32 {
        data[32 + i] = y_bytes[i];
    }

    // 3) Hash it
    let hash: [u8; 32] = keccak256::keccak256(data, 64);
    Field::from_be_bytes(hash)
}

/// Main circuit: proves value_a, value_b produce a leaf which is in Merkle tree
#[export]
pub fn main(
    subtree_root: Field,
    block_timestamp: Field,
    root: Field,
    path: [Field; DEPTH],
    index_bits: [u1; DEPTH],
) -> pub (Field, Field, Field, Field) {
   
    let leaf = mimc_hash([subtree_root, block_timestamp]);
    let computed_root = binary_merkle_root::<DEPTH>(mimc_hash, leaf, DEPTH, index_bits, path);

    assert(computed_root == root);
    (computed_root, block_timestamp, subtree_root, bits_to_index(index_bits))
}


/* USING A single keccak256
{"functions": [
  {
        "acir_opcodes": 8446,
        "circuit_size": 28664
  }
]}
*/
/* USING MIMC
Scheme is: ultra_honk
{"functions": [
  {
        "acir_opcodes": 7787,
        "circuit_size": 10577
  }
]}

*/