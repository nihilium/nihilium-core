use anchor_lang::prelude::*;
use tiny_keccak::{Hasher, Keccak};

declare_id!("AHdizgCbxeWJjSVZiQKS4QfHmeKdBVAKHqxRnFtguvK2");

#[derive(Accounts)]
pub struct Verify<'info> {
    /// CHECK: This account is used for proof verification and is checked by the program logic
    pub verifier: AccountInfo<'info>,
}

#[program]
pub mod sub_tree_verifier {
    use super::*;

    /// Standardized verification interface for sub-tree proofs
    pub fn verify(
        ctx: Context<Verify>,
        proof: Vec<u8>,
        public_signals: Vec<[u8; 32]>,
    ) -> Result<bool> {
        let levels = (proof.len() / 32) as u32;
        let mut proof_bytes32 = Vec::new();
        
        // Extract bytes32 values from proof
        for i in 0..levels {
            let start = (i * 32) as usize;
            let end = start + 32;
            if end <= proof.len() {
                let mut bytes = [0u8; 32];
                bytes.copy_from_slice(&proof[start..end]);
                proof_bytes32.push(bytes);
            }
        }
        
        let mut current_leaf_value = public_signals[1];
        let mut current_index_bytes = [0u8; 8];
        current_index_bytes.copy_from_slice(&public_signals[2][0..8]);
        let current_index = u64::from_le_bytes(current_index_bytes);
        let computed_root = public_signals[0];
        
        for i in 0..levels {
            current_leaf_value = if ((current_index & (1 << i)) >> i) == 1 {
                efficient_hash(proof_bytes32[i as usize], current_leaf_value)
            } else {
                efficient_hash(current_leaf_value, proof_bytes32[i as usize])
            };
        }
        
        Ok(current_leaf_value == computed_root)
    }
}

fn efficient_hash(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    let mut input = Vec::new();
    input.extend_from_slice(&a);
    input.extend_from_slice(&b);
    let mut hash = [0u8; 32];
    let mut hasher = Keccak::v256();
    hasher.update(&input);
    hasher.finalize(&mut hash);
    hash
}
