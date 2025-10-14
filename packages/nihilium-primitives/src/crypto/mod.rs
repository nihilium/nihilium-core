//! Cryptographic primitives for the Nihilium protocol
//!
//! This module provides ZK-friendly cryptographic operations including:
//! - Baby Jubjub curve operations
//! - Poseidon and MiMC hash functions
//! - EdDSA-Poseidon signatures
//! - Homomorphic and ECC encryption
//!
//! All primitives are compatible with circomlibjs and designed for
//! efficient zero-knowledge circuit integration.

pub mod babyjub;
pub mod ecc;
pub mod eddsa;
pub mod he;
pub mod mimc;
pub mod poseidon;
pub mod types;
pub mod utils;

// Re-export commonly used types and functions
pub use babyjub::{Point, PrivateKey, PublicKey};
pub use ecc::{decrypt_ecc_babyjub, encrypt_ecc_babyjub, ECCEncryptedMessage};
pub use eddsa::{derive_public_key, sign_message, verify_signature, Signature};
pub use he::{he_decrypt, he_encrypt, HEEncrypted};
pub use mimc::{mimc_hash, ZERO_MIMC};
pub use poseidon::{hash_cypher_text, poseidon1, poseidon2, poseidon4};
pub use types::*;
pub use utils::*;
