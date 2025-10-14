//! Utility functions for cryptographic operations

use super::types::{CryptoError, Result, CHUNK_MASK, CHUNK_SIZE, SNARK_FIELD_SIZE};
use ark_bn254::Fr as FieldElement;
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use num_traits::Num;
use rand::Rng;

/// Convert a field element to a padded hex string
/// Equivalent to TypeScript's `toPaddedHex`
pub fn to_padded_hex(value: &FieldElement) -> String {
    let bytes = value.into_bigint().to_bytes_be();
    format!("0x{}", hex::encode(bytes))
}

/// Convert a hex string to a field element
pub fn hex_to_field_element(hex: &str) -> Result<FieldElement> {
    let hex_str = hex.strip_prefix("0x").unwrap_or(hex);
    let big_uint = BigUint::from_str_radix(hex_str, 16)
        .map_err(|e| CryptoError::ConversionError(e.to_string()))?;

    let bytes = big_uint.to_bytes_be();
    Ok(FieldElement::from_be_bytes_mod_order(&bytes))
}

/// Generate a random 248-bit number
/// Equivalent to TypeScript's `generateRandom248BitNumber`
pub fn generate_random_248bit_number() -> FieldElement {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 31]; // 31 bytes = 248 bits
    rng.fill(&mut bytes);

    FieldElement::from_be_bytes_mod_order(&bytes)
}

/// Generate a cryptographically secure random field element
/// Equivalent to TypeScript's `genRandomBabyJubValue`
pub fn gen_random_babyjub_value() -> FieldElement {
    loop {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 32];
        rng.fill(&mut bytes);

        // Shift right by 8 bits to ensure 253 bits max
        let mut value = BigUint::from_bytes_be(&bytes);
        value >>= 8;

        // Convert to field element
        let fe = FieldElement::from_be_bytes_mod_order(&value.to_bytes_be());

        // Check if value is >= min (to prevent modulo bias)
        let min = BigUint::from_str_radix(
            "452312848583266388373324160190187140051835877600158453279131187530910662656",
            10,
        )
        .unwrap();

        if value >= min {
            return fe;
        }
    }
}

/// Shrink a field element to specified number of bits
/// Equivalent to TypeScript's `shrinkToBits`
pub fn shrink_to_bits(value: &FieldElement, bits: u32) -> FieldElement {
    let mask = (BigUint::from(1u64) << (bits as usize)) - BigUint::from(1u64);
    let value_biguint = BigUint::from_bytes_be(&value.into_bigint().to_bytes_be());
    let result = value_biguint & mask;

    FieldElement::from_be_bytes_mod_order(&result.to_bytes_be())
}

/// Split a large number into chunks of CHUNK_SIZE bits each (31 bits)
/// Equivalent to TypeScript's `splitLargeNumber`
/// Returns up to 8 chunks for 248-bit values
pub fn split_large_number(number: &FieldElement) -> Vec<FieldElement> {
    let mut chunks = Vec::new();
    let mut value = BigUint::from_bytes_be(&number.into_bigint().to_bytes_be());

    let chunk_mask = BigUint::from(CHUNK_MASK);

    while value > BigUint::from(0u64) {
        let chunk = &value & &chunk_mask;
        chunks.push(FieldElement::from_be_bytes_mod_order(&chunk.to_bytes_be()));
        value >>= CHUNK_SIZE as usize;
    }

    if chunks.is_empty() {
        chunks.push(FieldElement::from(0u64));
    }

    chunks
}

/// Combine chunks with carry handling
/// Equivalent to TypeScript's `combineChunksWithCarry`
pub fn combine_chunks_with_carry(chunks: &[FieldElement]) -> FieldElement {
    let mut combined = BigUint::from(0u64);
    let mut carry = BigUint::from(0u64);
    let mask = (BigUint::from(1u64) << (CHUNK_SIZE as usize)) - BigUint::from(1u64);

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_biguint = BigUint::from_bytes_be(&chunk.into_bigint().to_bytes_be());
        let mut chunk_with_carry = chunk_biguint + &carry;
        carry = &chunk_with_carry >> (CHUNK_SIZE as usize);
        chunk_with_carry &= &mask;
        combined += chunk_with_carry << ((i as u32 * CHUNK_SIZE) as usize);
    }

    if carry > BigUint::from(0u64) {
        combined += carry << ((chunks.len() as u32 * CHUNK_SIZE) as usize);
    }

    FieldElement::from_be_bytes_mod_order(&combined.to_bytes_be())
}

/// Convert BigUint to Buffer (Vec<u8>)
/// Equivalent to TypeScript's `bigInt2Buffer`
pub fn biguint_to_buffer(value: &BigUint) -> Vec<u8> {
    value.to_bytes_be()
}

/// Convert Buffer to BigUint
/// Equivalent to TypeScript's `bufferToBigInt`
pub fn buffer_to_biguint(buffer: &[u8]) -> BigUint {
    BigUint::from_bytes_be(buffer)
}

/// Convert Uint8Array to hex string
/// Equivalent to TypeScript's `uint8ArrayToHex`
pub fn uint8array_to_hex(data: &[u8]) -> String {
    hex::encode(data)
}

/// Convert hex string to bytes
pub fn hex_to_bytes(hex: &str) -> Result<Vec<u8>> {
    let hex_str = hex.strip_prefix("0x").unwrap_or(hex);
    hex::decode(hex_str).map_err(|e| CryptoError::ConversionError(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_padded_hex() {
        let value = FieldElement::from(42u64);
        let hex = to_padded_hex(&value);
        assert!(hex.starts_with("0x"));
    }

    #[test]
    fn test_split_and_combine() {
        let original = generate_random_248bit_number();
        let chunks = split_large_number(&original);
        let combined = combine_chunks_with_carry(&chunks);

        // Should be equal (modulo field size)
        assert_eq!(original, combined);
    }

    #[test]
    fn test_shrink_to_bits() {
        let value = FieldElement::from(0xFFFFFFFFu64);
        let shrunk = shrink_to_bits(&value, 16);
        let expected = FieldElement::from(0xFFFFu64);
        assert_eq!(shrunk, expected);
    }
}
