use anchor_lang::prelude::*;
use tiny_keccak::{Hasher, Keccak};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct ProvingState {
    pub current_hash: [u8; 32],
    pub expected_hash: [u8; 32],
    pub current_index: u64,
    pub outputs: Vec<Vec<[u8; 32]>>,
    pub prepared_public_inputs: Vec<[u8; 32]>,
    pub prepared_proof: Vec<u8>,
    pub proof_verifier: Pubkey,
    pub commited_processor_public_key: Vec<u64>,
    pub initiator: Pubkey,
}

#[account]
pub struct ChainedProof {
    pub public_proof_verifier: Pubkey,
    pub forced_opening_verifier: Pubkey,
    /// CHECK: This field stores proving states as a vector of key-value pairs
    /// instead of HashMap for Anchor serialization compatibility
    pub proving_states: Vec<([u8; 32], ProvingState)>,
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
        mut,
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
    mut state: ProvingState,
    verifier: Pubkey,
    public_inputs: Vec<[u8; 32]>,
    proof: Vec<u8>,
) -> Result<ProvingState> {
    // Hash the current state with the verifier
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(&verifier.to_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    state.prepared_public_inputs = public_inputs;
    state.prepared_proof = proof;
    state.proof_verifier = verifier;
    
    Ok(state)
}

pub fn dryrun_validate_data_root(
    ctx: Context<DryrunValidateDataRoot>,
    mut state: ProvingState,
    _datastream: Pubkey,
    public_input_index: u64,
    _is_delayed_proof: bool,
    _optional_dual_tree_proof: Vec<u8>,
    _optional_dual_tree_public_inputs: Vec<[u8; 32]>,
    _merkle_root_index: u64,
) -> Result<ProvingState> {
    require!(state.prepared_proof.len() > 0, ErrorCode::InvalidState);
    require!(state.prepared_public_inputs.len() > 0, ErrorCode::InvalidState);
    require!(state.proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
    
    // Hash with action and public input index
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(ACTION_VALIDATE_DATA_ROOT.as_bytes());
    hash_input.extend_from_slice(&public_input_index.to_le_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    Ok(state)
}

pub fn dryrun_validate_timestamp(
    ctx: Context<DryrunValidateTimestamp>,
    mut state: ProvingState,
    output_proof_index: u64,
    output_index: u64,
    public_input_index: u64,
    timestamp_window: u64,
) -> Result<ProvingState> {
    require!(state.prepared_proof.len() > 0, ErrorCode::InvalidState);
    require!(state.prepared_public_inputs.len() > 0, ErrorCode::InvalidState);
    require!(state.proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
    
    // Hash with action
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(ACTION_VALIDATE_TIMESTAMP.as_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    // Validate timestamp window
    if state.outputs.len() > output_proof_index as usize && 
       state.outputs[output_proof_index as usize].len() > output_index as usize &&
       state.prepared_public_inputs.len() > public_input_index as usize {
        
        let mut timestamp1_bytes = [0u8; 8];
        timestamp1_bytes.copy_from_slice(&state.outputs[output_proof_index as usize][output_index as usize][0..8]);
        let timestamp1 = u64::from_le_bytes(timestamp1_bytes);
        
        let mut timestamp2_bytes = [0u8; 8];
        timestamp2_bytes.copy_from_slice(&state.prepared_public_inputs[public_input_index as usize][0..8]);
        let timestamp2 = u64::from_le_bytes(timestamp2_bytes);
        
        require!(
            timestamp1 >= timestamp2.saturating_sub(timestamp_window) && 
            timestamp1 <= timestamp2.saturating_add(timestamp_window),
            ErrorCode::TimestampValidationFailed
        );
    }
    
    // Hash with parameters
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(&output_proof_index.to_le_bytes());
    hash_input.extend_from_slice(&output_index.to_le_bytes());
    hash_input.extend_from_slice(&public_input_index.to_le_bytes());
    hash_input.extend_from_slice(&timestamp_window.to_le_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    Ok(state)
}

pub fn dryrun_chain_static_input(
    ctx: Context<DryrunChainStaticInput>,
    mut state: ProvingState,
    inputs: Vec<[u8; 32]>,
    indexes: Vec<u64>,
) -> Result<ProvingState> {
    require!(indexes.len() == inputs.len(), ErrorCode::InvalidInputs);
    require!(state.prepared_proof.len() > 0, ErrorCode::InvalidState);
    
    // Hash with action
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(ACTION_STATIC_INPUT.as_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    // Update prepared inputs and hash each input
    for (i, &index) in indexes.iter().enumerate() {
        if (index as usize) < state.prepared_public_inputs.len() {
            state.prepared_public_inputs[index as usize] = inputs[i];
        }
        
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&state.current_hash);
        hash_input.extend_from_slice(&index.to_le_bytes());
        hash_input.extend_from_slice(&inputs[i]);
        
        let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    }
    
    Ok(state)
}

pub fn dryrun_chain_pass_signal(
    ctx: Context<DryrunChainPassSignal>,
    mut state: ProvingState,
    public_input_indexes: Vec<u64>,
    output_proof_indexes: Vec<u64>,
    output_indexes: Vec<u64>,
) -> Result<ProvingState> {
    require!(public_input_indexes.len() == output_indexes.len(), ErrorCode::InvalidInputs);
    require!(state.prepared_proof.len() > 0, ErrorCode::InvalidState);
    
    // Hash with action
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(ACTION_PASS_SIGNAL.as_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    // Update prepared inputs with outputs and hash each mapping
    for i in 0..public_input_indexes.len() {
        let public_input_index = public_input_indexes[i] as usize;
        let output_proof_index = output_proof_indexes[i] as usize;
        let output_index = output_indexes[i] as usize;
        
        if output_proof_index < state.outputs.len() && 
           output_index < state.outputs[output_proof_index].len() &&
           public_input_index < state.prepared_public_inputs.len() {
            
            state.prepared_public_inputs[public_input_index] = 
                state.outputs[output_proof_index][output_index];
        }
        
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&state.current_hash);
        hash_input.extend_from_slice(&public_input_indexes[i].to_le_bytes());
        hash_input.extend_from_slice(&output_proof_indexes[i].to_le_bytes());
        hash_input.extend_from_slice(&output_indexes[i].to_le_bytes());
        
        let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    }
    
    Ok(state)
}

pub fn dryrun_chain_proof_verify(
    ctx: Context<DryrunChainProofVerify>,
    mut state: ProvingState,
    ignore_proof: bool,
) -> Result<ProvingState> {
    require!(state.prepared_proof.len() > 0, ErrorCode::InvalidState);
    require!(state.prepared_public_inputs.len() > 0, ErrorCode::InvalidState);
    require!(state.proof_verifier != Pubkey::default(), ErrorCode::InvalidState);
    
    if !ignore_proof {
        // In a real implementation, you would call the verifier here
        // For now, we'll assume the proof is valid
    }
    
    // Hash with verifier
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&state.current_hash);
    hash_input.extend_from_slice(&state.proof_verifier.to_bytes());
    
    let mut hasher = Keccak::v256();
    hasher.update(&hash_input);
    hasher.finalize(&mut state.current_hash);
    
    // Add outputs
    state.outputs.push(state.prepared_public_inputs.clone());
    
    // Clear prepared data
    state.prepared_proof = Vec::new();
    state.prepared_public_inputs = Vec::new();
    
    Ok(state)
}

pub fn dryrun_start_proving(
    ctx: Context<DryrunStartProving>,
    verifier: Pubkey,
    public_inputs: Vec<[u8; 32]>,
    proof: Vec<u8>,
    verify_proof: bool,
) -> Result<ProvingState> {
    if verify_proof {
        // In a real implementation, you would call the verifier here
        // For now, we'll assume the proof is valid
    }
    
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&verifier.to_bytes());
    
    let state = ProvingState {
        current_hash: {
            let mut hash = [0u8; 32];
            let mut hasher = Keccak::v256();
            hasher.update(&hash_input);
            hasher.finalize(&mut hash);
            hash
        },
        expected_hash: public_inputs[0],
        current_index: 0,
        outputs: vec![public_inputs.clone()],
        prepared_public_inputs: public_inputs.clone(),
        prepared_proof: proof,
        proof_verifier: verifier,
        commited_processor_public_key: {
            let mut bytes1 = [0u8; 8];
            bytes1.copy_from_slice(&public_inputs[0][0..8]);
            let mut bytes2 = [0u8; 8];
            bytes2.copy_from_slice(&public_inputs[0][0..8]);
            vec![
                u64::from_le_bytes(bytes1),
                u64::from_le_bytes(bytes2),
            ]
        },
        initiator: Pubkey::default(),
    };
    
    Ok(state)
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid inputs")]
    InvalidInputs,
    #[msg("Timestamp validation failed")]
    TimestampValidationFailed,
}
