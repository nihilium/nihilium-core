//! MiMC-7 hash function
//!
//! Compatible with circomlibjs MiMC implementation

use super::types::{CryptoError, Result};
use ark_bn254::Fr as FieldElement;
use ark_bn254::Fr as MimcFr;
use ark_ff::{BigInteger, PrimeField};
use mimc_rs::Mimc7;

/// Zero element for MiMC trees: mimc7(42, 42)
/// From TypeScript: 7507787612525723758659662260399184323980001748885802124580171315331567144978n
pub const ZERO_MIMC: &str =
    "7507787612525723758659662260399184323980001748885802124580171315331567144978";

/// MiMC-7 hash function
/// Equivalent to TypeScript's `treeHasher` using buildMimc7()
pub fn mimc_hash(left: &FieldElement, right: &FieldElement) -> Result<FieldElement> {
    let mimc = Mimc7::new();

    // Convert ark_bn254::Fr to mimc_rs::Fr
    let left_bytes = (*left).into_bigint().to_bytes_be();
    let right_bytes = (*right).into_bigint().to_bytes_be();

    let left_mimc = MimcFr::from_be_bytes_mod_order(&left_bytes);
    let right_mimc = MimcFr::from_be_bytes_mod_order(&right_bytes);

    // Hash - mimc-rs hash takes a BigInt directly
    // Convert Fr to num_bigint::BigInt (signed) for mimc-rs
    let left_bigint = num_bigint::BigInt::from_bytes_be(num_bigint::Sign::Plus, &left_bytes);
    let right_bigint = num_bigint::BigInt::from_bytes_be(num_bigint::Sign::Plus, &right_bytes);

    // MiMC hash takes a Vec<BigInt> - pass both values for tree hashing
    let result_bigint = mimc
        .hash(vec![left_bigint, right_bigint])
        .map_err(|e| CryptoError::CurveError(format!("MiMC hash error: {}", e)))?;

    // Convert BigInt back to ark_bn254::Fr
    let (_, result_bytes) = result_bigint.to_bytes_be();
    Ok(FieldElement::from_be_bytes_mod_order(&result_bytes))
}

/// Get the zero element for MiMC trees
pub fn get_zero_mimc() -> FieldElement {
    use ark_ff::PrimeField;
    use num_bigint::BigUint;
    use num_traits::Num;

    let zero_biguint = BigUint::from_str_radix(ZERO_MIMC, 10).unwrap();
    FieldElement::from_be_bytes_mod_order(&zero_biguint.to_bytes_be())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::PrimeField;

    #[test]
    fn test_mimc_hash() {
        let left = FieldElement::from(42u64);
        let right = FieldElement::from(42u64);

        let hash = mimc_hash(&left, &right).unwrap();

        // Should produce the zero element when hashing (42, 42)
        let zero = get_zero_mimc();
        assert_eq!(hash, zero);
    }

    #[test]
    fn test_mimc_hash_different_inputs() {
        let left = FieldElement::from(1u64);
        let right = FieldElement::from(2u64);

        let hash = mimc_hash(&left, &right).unwrap();
        assert_ne!(hash, FieldElement::from(0u64));
    }
}
