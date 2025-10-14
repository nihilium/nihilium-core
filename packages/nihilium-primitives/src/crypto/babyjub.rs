//! Baby Jubjub elliptic curve operations
//!
//! This module provides curve operations compatible with circomlibjs
//! using the jubjub-elgamal crate for the JubJub (Baby Jubjub) curve.

use super::types::{CryptoError, Keypair, Result};
use super::utils::{biguint_to_buffer, generate_random_248bit_number};
use ark_bn254::Fr as FieldElement;
use ark_ff::{BigInteger, PrimeField};
use blake2::Blake2b512;
use blake2::Digest;
use dusk_jubjub::{JubJubAffine, JubJubExtended, JubJubScalar, GENERATOR_EXTENDED};
use num_bigint::BigUint;

/// Private key type (field element)
pub type PrivateKey = FieldElement;

/// Public key type (curve point as [x, y])
pub type PublicKey = (FieldElement, FieldElement);

/// Extended point type
pub type Point = JubJubExtended;

/// Generate a random private key (248-bit)
/// Equivalent to TypeScript's `genPrivKey`
pub fn gen_priv_key() -> PrivateKey {
    generate_random_248bit_number()
}

/// Prune buffer for Baby Jubjub compatibility
/// Taken from circomlibjs eddsa.js
fn prune_buffer(mut buff: Vec<u8>) -> Vec<u8> {
    buff[0] &= 0xf8;
    buff[31] &= 0x7f;
    buff[31] |= 0x40;
    buff
}

/// Create Blake2b-512 hash (compatible with circomlibjs)
fn create_blake_hash(data: &[u8]) -> Vec<u8> {
    let mut hasher = Blake2b512::new();
    hasher.update(data);
    hasher.finalize()[..32].to_vec()
}

/// Convert field element to JubJubScalar
fn field_to_jubjub_scalar(fe: &FieldElement) -> Result<JubJubScalar> {
    let bytes = fe.into_bigint().to_bytes_le();
    let mut array = [0u8; 32];
    array[..bytes.len().min(32)].copy_from_slice(&bytes[..bytes.len().min(32)]);

    JubJubScalar::from_bytes(&array)
        .into_option()
        .ok_or_else(|| {
            CryptoError::ConversionError("Failed to convert to JubJubScalar".to_string())
        })
}

/// Convert JubJubScalar to field element
fn jubjub_scalar_to_field(scalar: &JubJubScalar) -> FieldElement {
    let bytes = scalar.to_bytes();
    FieldElement::from_le_bytes_mod_order(&bytes)
}

/// Convert JubJubExtended point to public key [u, v]
/// Note: JubJub uses (u, v) coordinates, not (x, y)
pub fn point_to_public_key(point: &Point) -> PublicKey {
    let affine = JubJubAffine::from(point);
    // JubJubAffine has public fields u and v
    let u_bytes = affine.get_u().to_bytes();
    let v_bytes = affine.get_v().to_bytes();

    let u = FieldElement::from_le_bytes_mod_order(&u_bytes);
    let v = FieldElement::from_le_bytes_mod_order(&v_bytes);

    (u, v)
}

/// Convert public key [u, v] to JubJubExtended point
/// TODO: This needs proper implementation - dusk-jubjub uses BlsScalar for coordinates
/// For now, this is a placeholder that will panic
pub fn public_key_to_point(_pubkey: &PublicKey) -> Result<Point> {
    // This conversion is complex because:
    // - JubJub coordinates use BlsScalar (BLS12-381 base field)
    // - Our PublicKey uses FieldElement (BN254 scalar field)
    // These are incompatible types
    Err(CryptoError::ConversionError(
        "public_key_to_point not yet implemented for dusk-jubjub".to_string(),
    ))
}

/// Generate public key from private key
/// Equivalent to TypeScript's `genPubKey` and `prv2pub`
pub fn gen_pub_key(priv_key: &PrivateKey) -> Result<PublicKey> {
    // Convert private key to bytes
    let priv_bytes = priv_key.into_bigint().to_bytes_be();

    // Hash with Blake2b
    let s_buff = prune_buffer(create_blake_hash(&priv_bytes));

    // Convert to scalar (shift right by 3 bits)
    let s_biguint = BigUint::from_bytes_le(&s_buff);
    let s_shifted: BigUint = s_biguint >> 3;

    // Convert to JubJubScalar
    let s_bytes = s_shifted.to_bytes_le();
    let mut s_array = [0u8; 32];
    s_array[..s_bytes.len().min(32)].copy_from_slice(&s_bytes[..s_bytes.len().min(32)]);

    let scalar = JubJubScalar::from_bytes(&s_array)
        .into_option()
        .ok_or_else(|| CryptoError::InvalidPrivateKey)?;

    // Multiply base point by scalar
    let pub_point = GENERATOR_EXTENDED * scalar;

    Ok(point_to_public_key(&pub_point))
}

/// Format private key for Baby Jubjub (used internally for operations)
/// Equivalent to TypeScript's `formatPrivKeyForBabyJub`
pub fn format_priv_key_for_babyjub(priv_key: &PrivateKey) -> Result<JubJubScalar> {
    let priv_bytes = priv_key.into_bigint().to_bytes_be();
    let s_buff = prune_buffer(create_blake_hash(&priv_bytes));

    let s_biguint = BigUint::from_bytes_le(&s_buff);
    let s_shifted: BigUint = s_biguint >> 3;

    let s_bytes = s_shifted.to_bytes_le();
    let mut s_array = [0u8; 32];
    s_array[..s_bytes.len().min(32)].copy_from_slice(&s_bytes[..s_bytes.len().min(32)]);

    JubJubScalar::from_bytes(&s_array)
        .into_option()
        .ok_or_else(|| CryptoError::InvalidPrivateKey)
}

/// Convert private scalar directly to public key
/// Equivalent to TypeScript's `privateScalarToPubKey`
pub fn private_scalar_to_pub_key(scalar: &FieldElement) -> PublicKey {
    let scalar_jubjub = field_to_jubjub_scalar(scalar).unwrap();
    let pub_point = GENERATOR_EXTENDED * scalar_jubjub;
    point_to_public_key(&pub_point)
}

/// Generate a keypair
/// Equivalent to TypeScript's `genKeypair`
pub fn gen_keypair() -> Result<Keypair> {
    let priv_key = gen_priv_key();
    let pub_key = gen_pub_key(&priv_key)?;

    Ok(Keypair { priv_key, pub_key })
}

/// Add two public keys
/// Equivalent to TypeScript's `combineTwoPublicKeys`
pub fn combine_two_public_keys(pk1: &PublicKey, pk2: &PublicKey) -> Result<PublicKey> {
    let point1 = public_key_to_point(pk1)?;
    let point2 = public_key_to_point(pk2)?;
    let point3 = point1 + point2;
    Ok(point_to_public_key(&point3))
}

/// Scalar multiplication
pub fn scalar_mul(point: &Point, scalar: &FieldElement) -> Point {
    let scalar_jubjub = field_to_jubjub_scalar(scalar).unwrap();
    point * scalar_jubjub
}

/// Point addition
pub fn point_add(p1: &Point, p2: &Point) -> Point {
    p1 + p2
}

/// Get generator point
pub fn generator() -> Point {
    GENERATOR_EXTENDED
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_generation() {
        let keypair = gen_keypair().unwrap();
        // Public key should be on curve
        assert!(public_key_to_point(&keypair.pub_key).is_ok());
    }

    #[test]
    fn test_derive_same_pubkey() {
        let priv_key = gen_priv_key();
        let pub_key1 = gen_pub_key(&priv_key).unwrap();
        let pub_key2 = gen_pub_key(&priv_key).unwrap();
        assert_eq!(pub_key1, pub_key2);
    }

    #[test]
    fn test_combine_public_keys() {
        let kp1 = gen_keypair().unwrap();
        let kp2 = gen_keypair().unwrap();

        let combined = combine_two_public_keys(&kp1.pub_key, &kp2.pub_key).unwrap();

        // Combined key should be on curve
        assert!(public_key_to_point(&combined).is_ok());
    }
}
