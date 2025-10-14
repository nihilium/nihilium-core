//! Common types and constants for cryptographic operations

pub use ark_bn254::Fr as FieldElement;
use serde::{Deserialize, Serialize};

/// BN254 scalar field size (same as SNARK_FIELD_SIZE in TypeScript)
/// 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const SNARK_FIELD_SIZE: &str =
    "21888242871839275222246405745257275088548364400416034343698204186575808495617";

/// Chunk size for splitting large numbers (31 bits for homomorphic encryption)
pub const CHUNK_SIZE: u32 = 31;

/// Chunk mask for 31-bit chunks
pub const CHUNK_MASK: u64 = (1 << 31) - 1;

/// Result type for crypto operations
pub type Result<T> = std::result::Result<T, CryptoError>;

/// Errors that can occur during cryptographic operations
#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Invalid field element: {0}")]
    InvalidFieldElement(String),

    #[error("Invalid point coordinates")]
    InvalidPoint,

    #[error("Invalid private key")]
    InvalidPrivateKey,

    #[error("Invalid public key")]
    InvalidPublicKey,

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("Decryption error: {0}")]
    DecryptionError(String),

    #[error("Signature verification failed")]
    SignatureVerificationFailed,

    #[error("Invalid signature format")]
    InvalidSignature,

    #[error("Curve operation error: {0}")]
    CurveError(String),

    #[error("Conversion error: {0}")]
    ConversionError(String),
}

/// Hex string wrapper (0x-prefixed)
pub type HexString = String;

/// EC point represented as [x, y] coordinates
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ECPoint {
    pub x: HexString,
    pub y: HexString,
}

impl ECPoint {
    pub fn new(x: HexString, y: HexString) -> Self {
        Self { x, y }
    }

    /// Create from field elements
    pub fn from_field_elements(x: FieldElement, y: FieldElement) -> Self {
        Self {
            x: format!("0x{}", hex::encode(x.to_string())),
            y: format!("0x{}", hex::encode(y.to_string())),
        }
    }
}

/// Keypair containing private and public keys
#[derive(Debug, Clone)]
pub struct Keypair {
    pub priv_key: FieldElement,
    pub pub_key: (FieldElement, FieldElement),
}
