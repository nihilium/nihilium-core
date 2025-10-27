use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

mod verifying_key;
use verifying_key::VERIFYINGKEY;

declare_id!("FvX2BGtrhYopTdKndMfMz4Gi8F16HKU7XGofh7mpNdTJ");

#[derive(Accounts)]
pub struct OpeningProof<'info> {
    /// CHECK: This account is used for proof verification and is checked by the program logic
    pub opening_proof: AccountInfo<'info>,
}

#[program]
pub mod opening_proof {
    use super::*;

    /// Verify a Groth16 proof with public signals
    /// This function is functionally equivalent to the Solidity verify function
    pub fn verify(
        _ctx: Context<OpeningProof>,
        proof: Vec<u8>,
        public_signals: Vec<[u8; 32]>,
    ) -> Result<bool> {
        // Validate proof length - should be 256 bytes (64 + 128 + 64)
        if proof.len() != 256 {
            return Err(ErrorCode::InvalidProofLength.into());
        }

        // Validate public signals length - should be 41 (matching Solidity contract)
        // The verifying key has 42 inputs (including constant term), but we expect 41 public signals
        if public_signals.len() != 41 {
            return Err(ErrorCode::InvalidPublicSignalsLength.into());
        }

        // Parse proof components
        let proof_a_bytes: [u8; 64] = proof[0..64].try_into()
            .map_err(|_| ErrorCode::InvalidProofFormat)?;
        let proof_b_bytes: [u8; 128] = proof[64..192].try_into()
            .map_err(|_| ErrorCode::InvalidProofFormat)?;
        let proof_c_bytes: [u8; 64] = proof[192..256].try_into()
            .map_err(|_| ErrorCode::InvalidProofFormat)?;

        // Convert public signals to the format expected by groth16-solana
        // The API expects [[u8; 32]; NR_INPUTS] where NR_INPUTS is 41
        let public_inputs_array: [[u8; 32]; 41] = public_signals.try_into()
            .map_err(|_| ErrorCode::InvalidPublicSignalsLength)?;

        // For groth16-solana, we need to negate proof_a
        // This is done by flipping the sign of the y-coordinate
        let mut proof_a_negated = proof_a_bytes;
        // Flip the sign bit of the y-coordinate (last 32 bytes)
        for i in 32..64 {
            proof_a_negated[i] = !proof_a_negated[i];
        }

        // Create verifier and verify
        let mut verifier = Groth16Verifier::new(
            &proof_a_negated,
            &proof_b_bytes,
            &proof_c_bytes,
            &public_inputs_array,
            &VERIFYINGKEY,
        ).map_err(|_| ErrorCode::VerificationFailed)?;

        // Perform verification
        verifier.verify().map_err(|_| ErrorCode::VerificationFailed)?;
        
        Ok(true)
    }

}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid proof length")]
    InvalidProofLength,
    #[msg("Invalid proof format")]
    InvalidProofFormat,
    #[msg("Invalid public signals length")]
    InvalidPublicSignalsLength,
    #[msg("Invalid public input length")]
    InvalidPublicInputLength,
    #[msg("Verification failed")]
    VerificationFailed,
}
