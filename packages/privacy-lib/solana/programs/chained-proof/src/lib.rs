use anchor_lang::prelude::*;
use tiny_keccak::{Hasher, Keccak};


// Import the verifier program for CPI
// use verifier::cpi::accounts::Verify as VerifierVerify;
// use verifier::cpi::verify as verifier_verify;
// use verifier::program::Verifier;

declare_id!("4VzEeAmMSWU4Co2bSBzqqEXYDeiFnzsY6NRKaNLjZnHs");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct OutputGroup {
    pub values: Vec<[u8; 32]>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct ProvingStateSolana {
    pub current_hash: [u8; 32],
    pub expected_hash: [u8; 32],
    pub current_index: u64,
    pub outputs: Vec<OutputGroup>,
    pub prepared_public_inputs: Vec<[u8; 32]>,
    pub prepared_proof: Vec<u8>,
    pub proof_verifier: Pubkey,
    pub commited_processor_public_key: Vec<[u8; 32]>,
    pub initiator: Pubkey,
}

#[account]
pub struct ChainedProof {
    pub public_proof_verifier: Pubkey,
    pub forced_opening_verifier: Pubkey,
    /// CHECK: This field stores proving states as a vector of key-value pairs
    /// instead of HashMap for Anchor serialization compatibility
    pub proving_states: Vec<([u8; 32], ProvingStateSolana)>,
}

pub const ACTION_START_UNSEALING: &str = "start_unsealing";
pub const ACTION_PREPARE_NEXT_PROOF: &str = "prepare_next_proof";
pub const ACTION_CHAIN_PROOF_VERIFY: &str = "chain_proof_verify";
pub const ACTION_STATIC_INPUT: &str = "static_input";
pub const ACTION_PASS_SIGNAL: &str = "pass_signal";
pub const ACTION_PASS_SIGNAL_PLUSONE: &str = "pass_signal_plusone";
pub const ACTION_VALIDATE_TIMESTAMP: &str = "validate_timestamp";
pub const ACTION_VALIDATE_DATA_ROOT: &str = "validate_data_root";

#[derive(Accounts)]
pub struct InitializeChainedProof<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 4 + (32 * 4), // Base account size + pubkeys + hash map overhead
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DryrunPrepareNextProof<'info> {
    #[account(        
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
}

#[derive(Accounts)]
pub struct DryrunValidateDataRoot<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
    /// CHECK: This account is used for data validation and is checked by the program logic
    pub datastream: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DryrunValidateTimestamp<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
}

#[derive(Accounts)]
pub struct DryrunChainStaticInput<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
}

#[derive(Accounts)]
pub struct DryrunChainPassSignal<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
}

#[derive(Accounts)]
pub struct DryrunChainProofVerify<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
    /// CHECK: This account is used for proof verification and is checked by the program logic
    pub verifier: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DryrunStartProving<'info> {
    #[account(
        seeds = [b"chained_proof"],
        bump
    )]
    pub chained_proof: Account<'info, ChainedProof>,
    /// CHECK: This account is used for proof verification and is checked by the program logic
    pub verifier: AccountInfo<'info>,
}

#[program]
pub mod chained_proof {
    use super::*;

    pub fn initialize_chained_proof(
        ctx: Context<InitializeChainedProof>,
        public_proof_verifier: Pubkey,
        forced_opening_verifier: Pubkey,
    ) -> Result<()> {
        let chained_proof = &mut ctx.accounts.chained_proof;
        chained_proof.public_proof_verifier = public_proof_verifier;
        chained_proof.forced_opening_verifier = forced_opening_verifier;
        chained_proof.proving_states = Vec::new();
        Ok(())
    }

    pub fn dryrun_prepare_next_proof(
        ctx: Context<DryrunPrepareNextProof>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        verifier: Pubkey,
        public_inputs: Vec<[u8; 32]>,
        proof: Vec<u8>,
    ) -> Result<ProvingStateSolana> {
        // Hash the current state with the verifier
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(&verifier.to_bytes());
        

       
        let mut new_current_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_current_hash);
        
        Ok(ProvingStateSolana {
            current_hash: new_current_hash,
            expected_hash,
            current_index,
            outputs,
            prepared_public_inputs,
            prepared_proof,
            proof_verifier: verifier,
            commited_processor_public_key,
            initiator,
        })
    }

    pub fn dryrun_validate_data_root(
        ctx: Context<DryrunValidateDataRoot>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        _datastream: Pubkey,
        public_input_index: u64,
        _is_delayed_proof: bool,
        _optional_dual_tree_proof: Vec<u8>,
        _optional_dual_tree_public_inputs: Vec<[u8; 32]>,
        _merkle_root_index: u64,
    ) -> Result<ProvingStateSolana> {
        require!(prepared_proof.len() > 0, ErrorCode::InvalidState);
        require!(prepared_public_inputs.len() > 0, ErrorCode::InvalidState);
        require!(proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
        
        // Hash with action and public input index
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(ACTION_VALIDATE_DATA_ROOT.as_bytes());
        hash_input.extend_from_slice(&public_input_index.to_le_bytes());
        
        let mut new_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_hash);
        
        Ok(ProvingStateSolana {
            current_hash: new_hash,
            expected_hash,
            current_index,
            outputs,
            prepared_public_inputs,
            prepared_proof,
            proof_verifier,
            commited_processor_public_key,
            initiator,
        })
    }

    pub fn dryrun_validate_timestamp(
        ctx: Context<DryrunValidateTimestamp>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        output_proof_index: u64,
        output_index: u64,
        public_input_index: u64,
        timestamp_window: u64,
    ) -> Result<ProvingStateSolana> {
        require!(prepared_proof.len() > 0, ErrorCode::InvalidState);
        require!(prepared_public_inputs.len() > 0, ErrorCode::InvalidState);
        require!(proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
        
        // Hash with action
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(ACTION_VALIDATE_TIMESTAMP.as_bytes());
        
        let mut new_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_hash);
        
        // Validate timestamp window
        if outputs.len() > output_proof_index as usize && 
           outputs[output_proof_index as usize].values.len() > output_index as usize &&
           prepared_public_inputs.len() > public_input_index as usize {
            
            let mut timestamp1_bytes = [0u8; 8];
            timestamp1_bytes.copy_from_slice(&outputs[output_proof_index as usize].values[output_index as usize][0..8]);
            let timestamp1 = u64::from_le_bytes(timestamp1_bytes);
            
            let mut timestamp2_bytes = [0u8; 8];
            timestamp2_bytes.copy_from_slice(&prepared_public_inputs[public_input_index as usize][0..8]);
            let timestamp2 = u64::from_le_bytes(timestamp2_bytes);
            
            require!(
                timestamp1 >= timestamp2.saturating_sub(timestamp_window) && 
                timestamp1 <= timestamp2.saturating_add(timestamp_window),
                ErrorCode::TimestampValidationFailed
            );
        }
        
        // Hash with parameters
        let mut hash_input2 = Vec::new();
        hash_input2.extend_from_slice(&new_hash);
        hash_input2.extend_from_slice(&output_proof_index.to_le_bytes());
        hash_input2.extend_from_slice(&output_index.to_le_bytes());
        hash_input2.extend_from_slice(&public_input_index.to_le_bytes());
        hash_input2.extend_from_slice(&timestamp_window.to_le_bytes());
        
        let mut final_hash = [0u8; 32];
        let mut hasher2 = Keccak::v256();
        hasher2.update(&hash_input2);
        hasher2.finalize(&mut final_hash);
        
        Ok(ProvingStateSolana {
            current_hash: final_hash,
            expected_hash,
            current_index,
            outputs,
            prepared_public_inputs,
            prepared_proof,
            proof_verifier,
            commited_processor_public_key,
            initiator,
        })
    }


    pub fn dryrun_chain_static_input(
        ctx: Context<DryrunChainStaticInput>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        inputs: Vec<[u8; 32]>,
        indexes: Vec<u64>,
    ) -> Result<ProvingStateSolana> {
        require!(inputs.len() == indexes.len(), ErrorCode::InvalidInputs);
        
        // Create a mutable copy of prepared_public_inputs to match TypeScript behavior
        let mut updated_prepared_public_inputs = prepared_public_inputs.clone();
        
        // Hash with action first (matching TypeScript implementation)
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(ACTION_STATIC_INPUT.as_bytes());
        
        let mut new_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_hash);
        
        // Then hash each input with its index (matching TypeScript order: hash, index, input)
        for i in 0..inputs.len() {
            // Update prepared_public_inputs if index is valid (matching TypeScript)
            if (indexes[i] as usize) < updated_prepared_public_inputs.len() {
                updated_prepared_public_inputs[indexes[i] as usize] = inputs[i];
            }
            
            let mut hash_input2 = Vec::new();
            hash_input2.extend_from_slice(&new_hash);
            hash_input2.extend_from_slice(&indexes[i].to_le_bytes()); // INDEX FIRST (matching TypeScript)
            hash_input2.extend_from_slice(&inputs[i]);                // INPUT SECOND (matching TypeScript)
            
            let mut hasher2 = Keccak::v256();
            hasher2.update(&hash_input2);
            hasher2.finalize(&mut new_hash);
        }
        
        Ok(ProvingStateSolana {
            current_hash: new_hash,
            expected_hash,
            current_index,
            outputs,
            prepared_public_inputs: updated_prepared_public_inputs,
            prepared_proof,
            proof_verifier,
            commited_processor_public_key,
            initiator,
        })
    }

    pub fn dryrun_chain_pass_signal(
        ctx: Context<DryrunChainPassSignal>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        public_input_indexes: Vec<u64>,
        output_proof_indexes: Vec<u64>,
        output_indexes: Vec<u64>,
    ) -> Result<ProvingStateSolana> {
        require!(public_input_indexes.len() == output_indexes.len(), ErrorCode::InvalidInputs);
        
        // Hash with action
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(ACTION_PASS_SIGNAL.as_bytes());
        
        let mut new_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_hash);
        
        // Hash each mapping
        for i in 0..public_input_indexes.len() {
            let mut hash_input2 = Vec::new();
            hash_input2.extend_from_slice(&new_hash);
            hash_input2.extend_from_slice(&public_input_indexes[i].to_le_bytes());
            hash_input2.extend_from_slice(&output_proof_indexes[i].to_le_bytes());
            hash_input2.extend_from_slice(&output_indexes[i].to_le_bytes());
            
            let mut hasher2 = Keccak::v256();
            hasher2.update(&hash_input2);
            hasher2.finalize(&mut new_hash);
        }
        
        Ok(ProvingStateSolana {
            current_hash: new_hash,
            expected_hash,
            current_index,
            outputs,
            prepared_public_inputs,
            prepared_proof,
            proof_verifier,
            commited_processor_public_key,
            initiator,
        })
    }

    pub fn dryrun_chain_proof_verify(
        ctx: Context<DryrunChainProofVerify>,
        current_hash: [u8; 32],
        expected_hash: [u8; 32],
        current_index: u64,
        outputs: Vec<OutputGroup>,
        prepared_public_inputs: Vec<[u8; 32]>,
        prepared_proof: Vec<u8>,
        proof_verifier: Pubkey,
        commited_processor_public_key: Vec<[u8; 32]>,
        initiator: Pubkey,
        ignore_proof: bool,
    ) -> Result<ProvingStateSolana> {
        require!(proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
        
        if !ignore_proof {
            // TODO: Call the verifier program specified in the proving state via CPI
            // For now, we'll skip the actual verification
        }
        
        // Hash with verifier
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&current_hash);
        hash_input.extend_from_slice(&proof_verifier.to_bytes());
        
        let mut new_hash = [0u8; 32];
        let mut hasher = Keccak::v256();
        hasher.update(&hash_input);
        hasher.finalize(&mut new_hash);
        
        // Add outputs (matching TypeScript behavior)
        let mut updated_outputs = outputs.clone();
        updated_outputs.push(OutputGroup {
            values: prepared_public_inputs.clone(),
        });
        
        // Clear prepared data (matching TypeScript behavior)
        let cleared_prepared_public_inputs = Vec::new();
        let cleared_prepared_proof = Vec::new();
        
        Ok(ProvingStateSolana {
            current_hash: new_hash,
            expected_hash,
            current_index,
            outputs: updated_outputs,
            prepared_public_inputs: cleared_prepared_public_inputs,
            prepared_proof: cleared_prepared_proof,
            proof_verifier,
            commited_processor_public_key,
            initiator,
        })
    }

    pub fn dryrun_start_proving(
        ctx: Context<DryrunStartProving>,
        verifier: Pubkey,
        public_inputs: Vec<[u8; 32]>,
        proof: Vec<u8>,
        verify_proof: bool,
    ) -> Result<ProvingStateSolana> {
        if verify_proof {
            // In a real implementation, you would call the verifier here
            // For now, we'll assume the proof is valid
        }
        
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&verifier.to_bytes());
        
        let state = ProvingStateSolana {
            current_hash: {
                let mut hash = [0u8; 32];
                let mut hasher = Keccak::v256();
                hasher.update(&hash_input);
                hasher.finalize(&mut hash);
                hash
            },
            expected_hash: public_inputs[0],
            current_index: 0,
            outputs: vec![OutputGroup {
                values: public_inputs.clone(),
            }],
            prepared_public_inputs: public_inputs.clone(),
            prepared_proof: proof,
            proof_verifier: verifier,
            commited_processor_public_key: {
                let mut bytes1 = [0u8; 32];
                bytes1.copy_from_slice(&public_inputs[0][0..32]);
                let mut bytes2 = [0u8; 32];
                bytes2.copy_from_slice(&public_inputs[0][0..32]);
                vec![
                    bytes1,
                    bytes2,
                ]
            },
            initiator: Pubkey::default(),
        };
        
        Ok(state)
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid inputs")]
    InvalidInputs,
    #[msg("Timestamp validation failed")]
    TimestampValidationFailed,
    #[msg("Proof verification failed")]
    ProofVerificationFailed,
}
