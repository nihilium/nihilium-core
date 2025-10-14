use crate::crypto::FieldElement;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MerkleError {
    #[error("Invalid tree depth: {0}")]
    InvalidDepth(String),

    #[error("Invalid leaf index: {0}")]
    InvalidLeafIndex(String),

    #[error("Tree is full")]
    TreeFull,

    #[error("Invalid proof length")]
    InvalidProofLength,

    #[error("Proof verification failed")]
    ProofVerificationFailed,

    #[error("Crypto error: {0}")]
    CryptoError(#[from] crate::crypto::CryptoError),

    #[error("Parse error: {0}")]
    ParseError(String),
}

pub type MerkleResult<T> = Result<T, MerkleError>;

/// Merkle proof for a leaf
#[derive(Debug, Clone)]
pub struct MerkleProof {
    /// Path indices (0 = left, 1 = right)
    pub path_indices: Vec<u32>,

    /// Sibling hashes for the path
    pub path_elements: Vec<FieldElement>,

    /// The leaf being proven
    pub leaf: FieldElement,

    /// The root of the tree
    pub root: FieldElement,
}

/// Trait for Merkle tree implementations
pub trait MerkleTree {
    /// Get the depth of the tree
    fn depth(&self) -> usize;

    /// Get the root of the tree
    fn root(&self) -> FieldElement;

    /// Get the number of leaves in the tree
    fn leaf_count(&self) -> usize;

    /// Insert a leaf into the tree
    fn insert(&mut self, leaf: FieldElement) -> MerkleResult<()>;

    /// Bulk insert multiple leaves
    fn bulk_insert(&mut self, leaves: Vec<FieldElement>) -> MerkleResult<()>;

    /// Get a proof for a leaf at a given index
    fn proof(&self, index: usize) -> MerkleResult<MerkleProof>;

    /// Verify a proof
    fn verify(&self, proof: &MerkleProof) -> MerkleResult<bool>;
}
