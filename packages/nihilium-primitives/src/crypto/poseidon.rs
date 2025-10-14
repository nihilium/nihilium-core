//! Poseidon hash functions using light-poseidon
//!
//! Provides poseidon1, poseidon2, and poseidon4 variants
//! compatible with circomlibjs and poseidon-lite

use super::types::{CryptoError, Result};
use ark_bn254::Fr as FieldElement;
use light_poseidon::{Poseidon, PoseidonHasher};

/// Poseidon hash with 1 input
pub fn poseidon1(input: &FieldElement) -> Result<FieldElement> {
    let mut hasher = Poseidon::<FieldElement>::new_circom(1)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    hasher
        .hash(&[*input])
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))
}

/// Poseidon hash with 2 inputs
pub fn poseidon2(inputs: &[FieldElement; 2]) -> Result<FieldElement> {
    let mut hasher = Poseidon::<FieldElement>::new_circom(2)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    hasher
        .hash(inputs)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))
}

/// Poseidon hash with 4 inputs
pub fn poseidon4(inputs: &[FieldElement; 4]) -> Result<FieldElement> {
    let mut hasher = Poseidon::<FieldElement>::new_circom(4)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    hasher
        .hash(inputs)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))
}

/// Hash cyphertext commitment (from TypeScript hashCypherText)
/// Uses poseidon16 for message/ephemeral arrays, then poseidon8 for final hash
pub fn hash_cypher_text(
    message: &[FieldElement],       // 16 elements
    ephemeral_key: &[FieldElement], // 16 elements
    related_public_key: &[FieldElement; 2],
    preimage_hash: &FieldElement,
    random_value: &FieldElement,
    unseal_condition_root_hash: &FieldElement,
    metadata_root_commit: &FieldElement,
) -> Result<FieldElement> {
    // Hash message array (16 elements)
    let mut hasher16 = Poseidon::<FieldElement>::new_circom(16)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    let message_array: [FieldElement; 16] = message
        .try_into()
        .map_err(|_| CryptoError::InvalidFieldElement("Message must be 16 elements".to_string()))?;

    let point_poseidon = hasher16
        .hash(&message_array)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))?;

    // Hash ephemeral key array (16 elements)
    let mut hasher16_2 = Poseidon::<FieldElement>::new_circom(16)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    let ephemeral_array: [FieldElement; 16] = ephemeral_key.try_into().map_err(|_| {
        CryptoError::InvalidFieldElement("Ephemeral key must be 16 elements".to_string())
    })?;

    let emph_poseidon = hasher16_2
        .hash(&ephemeral_array)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))?;

    // Final hash with 8 inputs
    let mut hasher8 = Poseidon::<FieldElement>::new_circom(8)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon init error: {:?}", e)))?;

    let final_inputs = [
        point_poseidon,
        emph_poseidon,
        related_public_key[0],
        related_public_key[1],
        *preimage_hash,
        *metadata_root_commit,
        *unseal_condition_root_hash,
        *random_value,
    ];

    hasher8
        .hash(&final_inputs)
        .map_err(|e| CryptoError::CurveError(format!("Poseidon hash error: {:?}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::PrimeField;

    #[test]
    fn test_poseidon1() {
        let input = FieldElement::from(42u64);
        let hash = poseidon1(&input).unwrap();
        assert_ne!(hash, FieldElement::from(0u64));
    }

    #[test]
    fn test_poseidon2() {
        let inputs = [FieldElement::from(42u64), FieldElement::from(100u64)];
        let hash = poseidon2(&inputs).unwrap();
        assert_ne!(hash, FieldElement::from(0u64));
    }

    #[test]
    fn test_poseidon4() {
        let inputs = [
            FieldElement::from(1u64),
            FieldElement::from(2u64),
            FieldElement::from(3u64),
            FieldElement::from(4u64),
        ];
        let hash = poseidon4(&inputs).unwrap();
        assert_ne!(hash, FieldElement::from(0u64));
    }
}
