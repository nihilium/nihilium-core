use anchor_lang::prelude::*;

declare_id!("WqbxrLUUxVthvX6ZBaniBm8jtckYXBnxdZamemU2cun");

#[derive(Accounts)]
pub struct Verify<'info> {
    /// CHECK: This account is used for proof verification and is checked by the program logic
    pub verifier: AccountInfo<'info>,
}

#[program]
pub mod test_verifier {
    use super::*;

    /// Standardized verification interface for test purposes
    /// Always returns true for testing
    pub fn verify(
        ctx: Context<Verify>,
        proof: Vec<u8>,
        public_signals: Vec<[u8; 32]>,
    ) -> Result<bool> {
        // Always return true for testing purposes
        Ok(true)
    }
}
