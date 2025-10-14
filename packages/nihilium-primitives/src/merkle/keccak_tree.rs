use crate::crypto::{utils::to_padded_hex, FieldElement, SNARK_FIELD_SIZE};
use crate::merkle::{MerkleError, MerkleProof, MerkleResult, MerkleTree as MerkleTreeTrait};
use ark_ff::PrimeField;
use num_bigint::BigUint;
use sha3::{Digest, Keccak256};
use std::str::FromStr;

/// Keccak256-based Merkle tree implementation (Ethereum-compatible)
pub struct KeccakMerkleTree {
    depth: usize,
    leaves: Vec<FieldElement>,
    zero_values: Vec<FieldElement>,
    layers: Vec<Vec<FieldElement>>,
}

/// Keccak256 hash function for Merkle tree (matches Ethereum implementation)
fn keccak_hash(left: &FieldElement, right: &FieldElement) -> MerkleResult<FieldElement> {
    let left_hex = to_padded_hex(left);
    let right_hex = to_padded_hex(right);

    // Combine: left (with 0x) + right (without 0x prefix)
    let combined = if right_hex.starts_with("0x") {
        format!("{}{}", left_hex, &right_hex[2..])
    } else {
        format!("{}{}", left_hex, right_hex)
    };

    let combined_bytes = hex::decode(&combined[2..])
        .map_err(|e| MerkleError::ParseError(format!("Failed to decode hex: {}", e)))?;

    let mut hasher = Keccak256::new();
    hasher.update(&combined_bytes);
    let result = hasher.finalize();

    let hash_hex = hex::encode(result);

    // Convert to FieldElement via BigUint
    let hash_bigint = BigUint::from_str(&format!("0x{}", hash_hex))
        .map_err(|e| MerkleError::ParseError(format!("Failed to parse hash: {}", e)))?;

    // Convert BigUint to bytes and then to FieldElement
    let bytes = hash_bigint.to_bytes_be();
    Ok(FieldElement::from_be_bytes_mod_order(&bytes))
}

impl KeccakMerkleTree {
    /// The zero element for Keccak trees (keccak256 of empty bytes)
    pub fn zero_element() -> MerkleResult<FieldElement> {
        // This matches ZERO_KECCAK from the TypeScript implementation
        // keccak256(0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6)
        let hex_str = "937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6";
        let bytes = hex::decode(hex_str).map_err(|e| {
            MerkleError::ParseError(format!("Failed to decode zero element: {}", e))
        })?;

        Ok(FieldElement::from_be_bytes_mod_order(&bytes))
    }

    /// Create a new Keccak Merkle tree with the given depth
    pub fn new(depth: usize) -> MerkleResult<Self> {
        if depth == 0 || depth > 32 {
            return Err(MerkleError::InvalidDepth(
                "Depth must be between 1 and 32".to_string(),
            ));
        }

        let zero_element = Self::zero_element()?;

        // Pre-compute zero values for each level
        let mut zero_values = vec![zero_element.clone()];
        for i in 0..depth {
            let prev = &zero_values[i];
            let next = keccak_hash(prev, prev)?;
            zero_values.push(next);
        }

        // Initialize layers
        let capacity = 1 << depth; // 2^depth
        let mut layers = vec![vec![]; depth + 1];
        layers[0] = vec![zero_element.clone(); capacity];

        Ok(Self {
            depth,
            leaves: Vec::new(),
            zero_values,
            layers,
        })
    }

    /// Create a new tree with initial leaves
    pub fn with_leaves(depth: usize, leaves: Vec<FieldElement>) -> MerkleResult<Self> {
        let mut tree = Self::new(depth)?;
        tree.bulk_insert(leaves)?;
        Ok(tree)
    }

    /// Update the tree structure after inserting leaves
    fn update(&mut self) -> MerkleResult<()> {
        let leaf_count = self.leaves.len();
        if leaf_count == 0 {
            return Ok(());
        }

        // Copy leaves to layer 0
        for (i, leaf) in self.leaves.iter().enumerate() {
            self.layers[0][i] = leaf.clone();
        }

        // Build tree from bottom up
        for level in 0..self.depth {
            let level_size = 1 << (self.depth - level); // 2^(depth - level)

            if self.layers[level + 1].len() != level_size / 2 {
                self.layers[level + 1] = vec![self.zero_values[level + 1].clone(); level_size / 2];
            }

            for i in 0..level_size / 2 {
                let left = &self.layers[level][i * 2];
                let right = &self.layers[level][i * 2 + 1];
                let hash = keccak_hash(left, right)?;
                self.layers[level + 1][i] = hash;
            }
        }

        Ok(())
    }

    /// Get the sibling of a node at a given level and index
    fn get_sibling(&self, level: usize, index: usize) -> FieldElement {
        let sibling_index = if index % 2 == 0 { index + 1 } else { index - 1 };

        if level < self.layers.len() && sibling_index < self.layers[level].len() {
            self.layers[level][sibling_index].clone()
        } else {
            self.zero_values[level].clone()
        }
    }
}

impl MerkleTreeTrait for KeccakMerkleTree {
    fn depth(&self) -> usize {
        self.depth
    }

    fn root(&self) -> FieldElement {
        if self.layers.last().is_some() {
            self.layers[self.depth][0].clone()
        } else {
            self.zero_values[self.depth].clone()
        }
    }

    fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    fn insert(&mut self, leaf: FieldElement) -> MerkleResult<()> {
        let capacity = 1 << self.depth;
        if self.leaves.len() >= capacity {
            return Err(MerkleError::TreeFull);
        }

        self.leaves.push(leaf);
        self.update()?;
        Ok(())
    }

    fn bulk_insert(&mut self, leaves: Vec<FieldElement>) -> MerkleResult<()> {
        let capacity = 1 << self.depth;
        if self.leaves.len() + leaves.len() > capacity {
            return Err(MerkleError::TreeFull);
        }

        self.leaves.extend(leaves);
        self.update()?;
        Ok(())
    }

    fn proof(&self, index: usize) -> MerkleResult<MerkleProof> {
        if index >= self.leaves.len() {
            return Err(MerkleError::InvalidLeafIndex(format!(
                "Index {} out of bounds (tree has {} leaves)",
                index,
                self.leaves.len()
            )));
        }

        let mut path_elements = Vec::new();
        let mut path_indices = Vec::new();
        let mut current_index = index;

        for level in 0..self.depth {
            let sibling = self.get_sibling(level, current_index);
            path_elements.push(sibling);
            path_indices.push((current_index % 2) as u32);
            current_index /= 2;
        }

        Ok(MerkleProof {
            path_indices,
            path_elements,
            leaf: self.leaves[index].clone(),
            root: self.root(),
        })
    }

    fn verify(&self, proof: &MerkleProof) -> MerkleResult<bool> {
        if proof.path_elements.len() != self.depth {
            return Err(MerkleError::InvalidProofLength);
        }

        let mut current = proof.leaf.clone();

        for (i, sibling) in proof.path_elements.iter().enumerate() {
            let path_index = proof.path_indices[i];
            current = if path_index == 0 {
                keccak_hash(&current, sibling)?
            } else {
                keccak_hash(sibling, &current)?
            };
        }

        Ok(current == proof.root)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_tree() {
        let tree = KeccakMerkleTree::new(4).unwrap();
        assert_eq!(tree.depth(), 4);
        assert_eq!(tree.leaf_count(), 0);
    }

    #[test]
    fn test_zero_element() {
        let _zero = KeccakMerkleTree::zero_element().unwrap();
        // Just verify it doesn't panic
    }

    #[test]
    fn test_insert_and_proof() {
        let mut tree = KeccakMerkleTree::new(4).unwrap();

        let leaf1 = FieldElement::from(42u64);
        let leaf2 = FieldElement::from(100u64);

        tree.insert(leaf1.clone()).unwrap();
        tree.insert(leaf2.clone()).unwrap();

        assert_eq!(tree.leaf_count(), 2);

        let proof = tree.proof(0).unwrap();
        assert!(tree.verify(&proof).unwrap());

        let proof2 = tree.proof(1).unwrap();
        assert!(tree.verify(&proof2).unwrap());
    }

    #[test]
    fn test_bulk_insert() {
        let leaves = vec![
            FieldElement::from(1u64),
            FieldElement::from(2u64),
            FieldElement::from(3u64),
            FieldElement::from(4u64),
        ];

        let tree = KeccakMerkleTree::with_leaves(4, leaves).unwrap();
        assert_eq!(tree.leaf_count(), 4);

        for i in 0..4 {
            let proof = tree.proof(i).unwrap();
            assert!(tree.verify(&proof).unwrap());
        }
    }

    #[test]
    fn test_tree_full() {
        let mut tree = KeccakMerkleTree::new(2).unwrap(); // Capacity of 4

        for i in 0..4 {
            tree.insert(FieldElement::from(i)).unwrap();
        }

        let result = tree.insert(FieldElement::from(5u64));
        assert!(matches!(result, Err(MerkleError::TreeFull)));
    }

    #[test]
    fn test_keccak_hash() {
        let left = FieldElement::from(42u64);
        let right = FieldElement::from(100u64);
        let hash = keccak_hash(&left, &right).unwrap();

        // Hash should not be zero
        assert!(hash != FieldElement::from(0u64));
    }
}
