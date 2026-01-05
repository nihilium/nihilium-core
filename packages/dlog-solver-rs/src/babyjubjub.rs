//! Baby Jubjub Elliptic Curve Implementation
//!
//! This module provides a clean implementation of the Baby Jubjub twisted Edwards curve
//! as specified in EIP-2494, designed for zero-knowledge proof applications.
//!
//! # Curve Specification
//!
//! Baby Jubjub is a twisted Edwards curve with equation: `a*x² + y² = 1 + d*x²*y²`
//!
//! - **Curve parameters**: a = 168700, d = 168696
//! - **Base field**: BN254 scalar field (Fq = 21888242871839275222246405745257275088548364400416034343698204186575808495617)
//! - **Scalar field**: Suborder r = 2736030358979909402780800718157159386076813972158567259200215660948447373041
//! - **Cofactor**: 8
//! - **Generator**: BASE8 point from EIP-2494
//!
//! # References
//!
//! - EIP-2494: https://eips.ethereum.org/EIPS/eip-2494
//! - Mathematical formulas reference: https://github.com/arnaucube/babyjubjub-ark
//! - circomlibjs implementation: https://github.com/iden3/circomlibjs
//!
//! # Compatibility
//!
//! This implementation is designed to be compatible with:
//! - circomlibjs (JavaScript/Circom)
//! - @noble/curves Baby Jubjub
//! - iden3 cryptographic libraries

use blake2::{digest::consts::U32, Blake2b, Digest};
use lazy_static::lazy_static;
use ark_bn254::Fr as Fq;
use ark_ff::{BigInteger, Field, PrimeField};
use ark_std::{One, Zero};
use num_bigint::BigUint;
use std::ops::{Add, Neg};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Curve error: {0}")]
    CurveError(String),
    #[error("Decoding error: {0}")]
    DecodingError(String),
}

pub type Result<T> = std::result::Result<T, CryptoError>;

// FieldElement is just Fq for our purposes
pub type FieldElement = Fq;

// ================================================================================================
// Curve Constants
// ================================================================================================

lazy_static! {
    /// Curve parameter 'a' in twisted Edwards equation: a*x² + y² = 1 + d*x²*y²
    pub static ref CURVE_A: Fq = Fq::from(168700u64);

    /// Curve parameter 'd' in twisted Edwards equation: a*x² + y² = 1 + d*x²*y²
    pub static ref CURVE_D: Fq = Fq::from(168696u64);

    /// Base field order (BN254 scalar field modulus)
    /// Note: Fq already has the correct modulus, this is just for reference
    pub static ref BASE_FIELD_ORDER: Fq = {
        // Fq is already the BN254 scalar field, so we can use it directly
        // This is just kept for compatibility
        Fq::from(1u64) // Placeholder, actual modulus is in Fq
    };

    /// Curve order (number of points on the curve)
    /// Note: This is kept for reference but not used in our implementation
    pub static ref CURVE_ORDER: Fq = Fq::from(1u64); // Placeholder

    /// Scalar field order (suborder = CURVE_ORDER / 8)
    /// Note: This is kept for reference but not used in our implementation
    pub static ref SCALAR_FIELD_ORDER: Fq = Fq::from(1u64); // Placeholder

    /// Generator point BASE8 (from EIP-2494)
    pub static ref BASE8: Point = Point {
        x: {
            let bigint = BigUint::parse_bytes(b"5299619240641551281634865583518297030282874472190772894086521144482721001553", 10).unwrap();
            let bytes = bigint.to_bytes_be();
            Fq::from_be_bytes_mod_order(&bytes)
        },
        y: {
            let bigint = BigUint::parse_bytes(b"16950150798460657717958625567821834550301663161624707787222815936182638968203", 10).unwrap();
            let bytes = bigint.to_bytes_be();
            Fq::from_be_bytes_mod_order(&bytes)
        },
    };
}

/// Cofactor of the curve (h = 8)
pub const COFACTOR: u8 = 8;

// ================================================================================================
// Core Types
// ================================================================================================

/// Affine point on the Baby Jubjub curve
///
/// Represents a point in affine coordinates (x, y) satisfying the curve equation:
/// `a*x² + y² = 1 + d*x²*y²`
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Point {
    pub x: Fq,
    pub y: Fq,
}

/// Projective point on the Baby Jubjub curve
///
/// Represents a point in projective coordinates (X:Y:Z) where x = X/Z, y = Y/Z.
/// Projective coordinates are more efficient for point arithmetic.
#[derive(Clone, Debug)]
pub struct PointProjective {
    pub x: Fq,
    pub y: Fq,
    pub z: Fq,
}

/// Public key type (point coordinates)
pub type PublicKey = (FieldElement, FieldElement);

/// Private key type (scalar)
pub type PrivateKey = FieldElement;

// ================================================================================================
// Point Implementation (Affine Coordinates)
// ================================================================================================

impl Point {
    /// Create a new point from affine coordinates
    ///
    /// Note: This does not check if the point is on the curve. Use `is_on_curve()` to verify.
    pub fn new(x: Fq, y: Fq) -> Self {
        Point { x, y }
    }

    /// Returns the identity point (neutral element) in affine form
    pub fn identity() -> Self {
        Point {
            x: Fq::zero(),
            y: Fq::one(),
        }
    }

    /// Check if this point is the identity
    pub fn is_identity(&self) -> bool {
        self.x.is_zero() && self.y.is_one()
    }

    /// Check if point is on the Baby Jubjub curve
    ///
    /// Verifies: a*x² + y² = 1 + d*x²*y²
    pub fn is_on_curve(&self) -> bool {
        let x2 = self.x.square();
        let y2 = self.y.square();

        let lhs = *CURVE_A * x2 + y2;
        let rhs = Fq::one() + *CURVE_D * x2 * y2;

        lhs == rhs
    }

    /// Convert to projective coordinates
    pub fn to_projective(&self) -> PointProjective {
        PointProjective {
            x: self.x,
            y: self.y,
            z: Fq::one(),
        }
    }

    /// Scalar multiplication: scalar * point
    ///
    /// Uses double-and-add algorithm in projective coordinates for efficiency
    pub fn mul_scalar(&self, scalar: &Fq) -> Point {
        // Handle zero scalar
        if scalar.is_zero() {
            return Point::identity();
        }
        
        // Handle scalar = 1
        if scalar.is_one() {
            return self.clone();
        }
        
        let scalar_bits = scalar.into_bigint().to_bits_le();
        let mut result = PointProjective::identity();
        let mut temp = self.to_projective();

        for bit in scalar_bits
            .iter()
            .take(scalar.into_bigint().num_bits() as usize)
        {
            if *bit {
                result = result.add(&temp);
            }
            temp = temp.double();
        }

        result.to_affine()
    }

    /// Point negation
    pub fn negate(&self) -> Point {
        Point {
            x: -self.x,
            y: self.y,
        }
    }

    /// Point addition in affine coordinates
    pub fn add_affine(&self, other: &Point) -> Point {
        self.to_projective().add(&other.to_projective()).to_affine()
    }

    /// Point subtraction
    pub fn sub(&self, other: &Point) -> Point {
        self.add_affine(&other.negate())
    }
}

impl Add for Point {
    type Output = Point;

    fn add(self, other: Point) -> Point {
        self.add_affine(&other)
    }
}

impl Neg for Point {
    type Output = Point;

    fn neg(self) -> Point {
        self.negate()
    }
}

// ================================================================================================
// PointProjective Implementation
// ================================================================================================

impl PointProjective {
    /// Returns the identity point in projective form
    pub fn identity() -> Self {
        PointProjective {
            x: Fq::zero(),
            y: Fq::one(),
            z: Fq::one(),
        }
    }

    /// Check if this point is the identity
    pub fn is_identity(&self) -> bool {
        self.x.is_zero() && self.y == self.z
    }

    /// Convert to affine coordinates
    pub fn to_affine(&self) -> Point {
        if self.z.is_zero() {
            return Point::identity();
        }

        let z_inv = self.z.inverse().expect("Cannot invert zero");
        Point {
            x: self.x * z_inv,
            y: self.y * z_inv,
        }
    }

    /// Point doubling in projective coordinates
    ///
    /// More efficient than adding a point to itself
    pub fn double(&self) -> PointProjective {
        // Use unified addition formula which handles doubling
        self.add(self)
    }

    /// Point addition in projective coordinates
    ///
    /// Uses the unified addition formula from:
    /// https://hyperelliptic.org/EFD/g1p/auto-twisted-projective.html#addition-add-2008-bbjlp
    ///
    /// This is the "add-2008-bbjlp" formula for twisted Edwards curves
    pub fn add(&self, other: &PointProjective) -> PointProjective {
        // A = Z1 * Z2
        let a = self.z * other.z;

        // B = A²
        let b = a.square();

        // C = X1 * X2
        let c = self.x * other.x;

        // D = Y1 * Y2
        let d = self.y * other.y;

        // E = d * C * D
        let e = *CURVE_D * c * d;

        // F = B - E
        let f = b - e;

        // G = B + E
        let g = b + e;

        // X3 = A * F * ((X1 + Y1) * (X2 + Y2) - C - D)
        let x3 = a * f * ((self.x + self.y) * (other.x + other.y) - c - d);

        // Y3 = A * G * (D - a*C)
        let y3 = a * g * (d - *CURVE_A * c);

        // Z3 = F * G
        let z3 = f * g;

        PointProjective {
            x: x3,
            y: y3,
            z: z3,
        }
    }
}

// ================================================================================================
// Public API Functions
// ================================================================================================

/// Get the Baby Jubjub generator point (BASE8)
///
/// This is the standard generator as defined in EIP-2494
pub fn generator() -> Point {
    BASE8.clone()
}

/// Verify that the generator point is valid
pub fn verify_generator() -> Result<()> {
    let gen = generator();

    if !gen.is_on_curve() {
        return Err(CryptoError::CurveError(
            "Generator point is not on curve".to_string(),
        ));
    }

    // Verify coordinates match EIP-2494
    let expected_x = {
        let bytes = BigUint::parse_bytes(
            b"5299619240641551281634865583518297030282874472190772894086521144482721001553",
            10,
        )
        .unwrap()
        .to_bytes_be();
        Fq::from_be_bytes_mod_order(&bytes)
    };
    let expected_y = {
        let bytes = BigUint::parse_bytes(
            b"16950150798460657717958625567821834550301663161624707787222815936182638968203",
            10,
        )
        .unwrap()
        .to_bytes_be();
        Fq::from_be_bytes_mod_order(&bytes)
    };

    if gen.x != expected_x || gen.y != expected_y {
        return Err(CryptoError::CurveError(
            "Generator coordinates do not match EIP-2494".to_string(),
        ));
    }

    Ok(())
}

/// Generate a random private key (248-bit)
/// Note: This is a placeholder - implement if needed
pub fn gen_priv_key() -> PrivateKey {
    // Placeholder - would need proper RNG
    Fq::from(1u64)
}

/// Generate public key from private key
///
/// Uses Blake2b-256 hash and pruning to match circomlibjs implementation
pub fn gen_pub_key(priv_key: &PrivateKey) -> Result<PublicKey> {
    let scalar = format_priv_key_for_babyjub(priv_key)?;
    let pub_point = generator().mul_scalar(&scalar);

    Ok((
        pub_point.x,
        pub_point.y,
    ))
}

/// Format private key for Baby Jubjub operations (EdDSA-style)
///
/// Process (matching circomlibjs):
/// 1. Convert private key to minimal-length big-endian bytes (strips leading zeros)
/// 2. Hash with Blake2b-256 (dkLen: 32)
/// 3. Prune buffer (RFC 8032 style)
/// 4. Convert to scalar (little-endian)
/// 5. Shift right by 3 bits
pub fn format_priv_key_for_babyjub(priv_key: &PrivateKey) -> Result<FieldElement> {
    // Convert to minimal big-endian bytes (matching TypeScript's bigInt2Buffer which strips leading zeros)
    let priv_biguint = BigUint::from_bytes_be(&priv_key.into_bigint().to_bytes_be());
    let priv_bytes = priv_biguint.to_bytes_be(); // This strips leading zeros

    // Hash with Blake2b-256 to match circomlibjs @noble/hashes/blake2b with dkLen: 32
    type Blake2b256 = Blake2b<U32>;
    let hash = Blake2b256::digest(&priv_bytes);
    let mut h = hash.to_vec();

    // Prune buffer (RFC 8032)
    h[0] &= 0xF8;
    h[31] &= 0x7F;
    h[31] |= 0x40;

    // Convert to field element using little-endian (matches circomlibjs Scalar.fromRprLE)
    let s_biguint = BigUint::from_bytes_le(&h);
    let s_shifted: BigUint = s_biguint >> 3;

    let bytes = s_shifted.to_bytes_be();
    Ok(Fq::from_be_bytes_mod_order(&bytes))
}

/// Convert private scalar directly to public key
pub fn private_scalar_to_pub_key(scalar: &FieldElement) -> PublicKey {
    let pub_point = generator().mul_scalar(scalar);
    (
        pub_point.x,
        pub_point.y,
    )
}

/// Combine two public keys (point addition)
pub fn combine_two_public_keys(pk1: &PublicKey, pk2: &PublicKey) -> Result<PublicKey> {
    let p1 = public_key_to_point(pk1)?;
    let p2 = public_key_to_point(pk2)?;
    let p3 = p1.add_affine(&p2);

    Ok((p3.x, p3.y))
}

/// Convert PublicKey tuple to Point
pub fn public_key_to_point(pubkey: &PublicKey) -> Result<Point> {
    let x = pubkey.0;
    let y = pubkey.1;

    let point = Point::new(x, y);

    if !point.is_on_curve() {
        return Err(CryptoError::CurveError(
            "Public key point is not on curve".to_string(),
        ));
    }

    Ok(point)
}

/// Convert Point to PublicKey tuple
pub fn point_to_public_key(point: &Point) -> PublicKey {
    (
        point.x,
        point.y,
    )
}

/// Convert Fq to decimal string (for lookup table keys)
pub fn fq_to_string(fq: &Fq) -> String {
    let bigint = fq.into_bigint();
    let bytes = bigint.to_bytes_be();
    let biguint = BigUint::from_bytes_be(&bytes);
    biguint.to_string()
}

/// Decode an encoded point back to plaintext using Baby-Step Giant-Step
/// Equivalent to TypeScript's `decode` and `optimizedDecode`
///
/// Uses BSGS algorithm with precomputed lookup table
/// For 32-bit values with precompute_size=19:
/// - Range: 32 - 19 = 13 bits
/// - Low part: 0..2^13 (8,192 iterations)
/// - High part: lookup table with 2^19 entries (524,288 entries)
///
/// Algorithm:
/// 1. For xlo in 0..2^range:
/// 2. Compute temp = encoded - (xlo * base)
/// 3. If temp.x is in lookup table:
/// 4. Return xlo + (table_value * 2^range)
pub fn decode(
    base_point: &Point,
    encoded: &Point,
    precompute_size: usize,
    lookup_table: &std::collections::HashMap<String, String>,
) -> Result<FieldElement> {
    // Calculate range
    let range = 32 - precompute_size;
    let range_bound = 1u64 << range; // 2^range

    // BSGS search
    for xlo in 0..range_bound {
        // Compute xlo * base_point
        let xlo_scalar = Fq::from(xlo);
        let lo_point = base_point.mul_scalar(&xlo_scalar);

        // Subtract from encoded: temp = encoded - (xlo * base)
        let temp = encoded.sub(&lo_point);

        // Get x-coordinate as decimal string for lookup
        let temp_x_str = fq_to_string(&temp.x);

        // Check lookup table
        if let Some(xhi_hex) = lookup_table.get(&temp_x_str) {
            // Found! Parse hex value and compute result: xlo + (xhi * 2^range)
            let xhi = BigUint::parse_bytes(xhi_hex.as_bytes(), 16)
                .ok_or_else(|| CryptoError::DecodingError("Invalid hex value in lookup table".to_string()))?;
            
            // Convert xhi to u64 and compute result
            let xhi_u64 = xhi.to_u64_digits();
            let xhi_val = if xhi_u64.is_empty() {
                0u64
            } else {
                xhi_u64[0]
            };
            
            // Compute: xlo + (xhi * 2^range)
            // Since result is 32-bit, we can safely use u64
            let result = xlo + (xhi_val << range);
            return Ok(Fq::from(result));
        }
    }

    Err(CryptoError::DecodingError(
        "Value not found in BSGS search - may exceed 32-bit range".to_string(),
    ))
}

/// Scalar multiplication helper function (for other modules)
///
/// Multiplies a point by a scalar (FieldElement/BigUint)
pub fn scalar_mul(point: &Point, scalar: &FieldElement) -> Point {
    point.mul_scalar(scalar)
}

/// Scalar multiplication from BigUint
pub fn scalar_mul_biguint(point: &Point, scalar: &BigUint) -> Point {
    // Convert BigUint to Fq
    let bytes = scalar.to_bytes_be();
    let fq_scalar = Fq::from_be_bytes_mod_order(&bytes);
    point.mul_scalar(&fq_scalar)
}

/// Point addition helper function (for other modules)
pub fn point_add(p1: &Point, p2: &Point) -> Point {
    p1.add_affine(p2)
}

/// Point subtraction helper function (for other modules)
pub fn point_sub(p1: &Point, p2: &Point) -> Point {
    p1.sub(p2)
}

/// Point negation helper function (for other modules)
pub fn point_negate(p: &Point) -> Point {
    p.negate()
}

/// Check if point is identity (for other modules)
pub fn is_identity(p: &Point) -> bool {
    p.is_identity()
}

/// Generate a keypair (for compatibility)
pub fn gen_keypair() -> Result<(PrivateKey, PublicKey)> {
    let priv_key = gen_priv_key();
    let pub_key = gen_pub_key(&priv_key)?;
    Ok((priv_key, pub_key))
}

// ================================================================================================
// Conversion Utilities
// ================================================================================================

/// Convert FieldElement (Fq) to Fq (no-op since they're the same)
pub fn fq_from_field_element(fe: &FieldElement) -> Fq {
    *fe
}

/// Convert Fq to FieldElement (no-op since they're the same)
pub fn field_element_from_fq(fq: &Fq) -> FieldElement {
    *fq
}

// ================================================================================================
// Tests
// ================================================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use hex;

    #[test]
    fn test_generator_verification() {
        let result = verify_generator();
        assert!(
            result.is_ok(),
            "Generator verification failed: {:?}",
            result
        );
    }

    #[test]
    fn test_generator_on_curve() {
        let gen = generator();
        assert!(gen.is_on_curve(), "Generator is not on curve");
    }

    #[test]
    fn test_identity_point() {
        let identity = Point::identity();
        assert!(identity.is_identity());
        assert!(identity.is_on_curve());
    }

    #[test]
    fn test_point_addition_identity() {
        let gen = generator();
        let identity = Point::identity();

        let result = gen.add_affine(&identity);
        assert_eq!(result, gen, "G + Identity should equal G");
    }

    #[test]
    fn test_point_negation() {
        let gen = generator();
        let neg_gen = gen.negate();

        let sum = gen.add_affine(&neg_gen);
        assert!(sum.is_identity(), "G + (-G) should equal identity");
    }

    #[test]
    fn test_scalar_multiplication_distributive() {
        let gen = generator();

        // Test: 3G + 5G = 8G
        let three_g = gen.mul_scalar(&Fq::from(3u64));
        let five_g = gen.mul_scalar(&Fq::from(5u64));
        let eight_g = gen.mul_scalar(&Fq::from(8u64));

        let sum = three_g.add_affine(&five_g);
        assert_eq!(sum, eight_g, "3G + 5G should equal 8G");
    }

    #[test]
    fn test_scalar_multiplication_zero() {
        let gen = generator();
        let result = gen.mul_scalar(&Fq::zero());
        assert!(result.is_identity(), "0 * G should be identity");
    }

    #[test]
    fn test_scalar_multiplication_one() {
        let gen = generator();
        let result = gen.mul_scalar(&Fq::one());
        assert_eq!(result, gen, "1 * G should equal G");
    }

    #[test]
    fn test_key_generation() {
        let priv_key = gen_priv_key();
        let pub_key = gen_pub_key(&priv_key).unwrap();

        // Public key should be a valid point on curve
        let point = public_key_to_point(&pub_key);
        assert!(point.is_ok());
    }

    #[test]
    fn test_deterministic_pubkey() {
        let priv_key = gen_priv_key();
        let pub_key1 = gen_pub_key(&priv_key).unwrap();
        let pub_key2 = gen_pub_key(&priv_key).unwrap();

        assert_eq!(
            pub_key1, pub_key2,
            "Same private key should produce same public key"
        );
    }

    #[test]
    fn test_combine_public_keys() {
        let priv1 = gen_priv_key();
        let priv2 = gen_priv_key();

        let pub1 = gen_pub_key(&priv1).unwrap();
        let pub2 = gen_pub_key(&priv2).unwrap();

        let combined = combine_two_public_keys(&pub1, &pub2).unwrap();
        let point = public_key_to_point(&combined);
        assert!(point.is_ok(), "Combined public key should be valid");
    }

    #[test]
    fn test_key_composition() {
        // Test that combining scalars and points works correctly
        let scalar1 = Fq::from(3u64);
        let scalar2 = Fq::from(5u64);

        let pub1 = private_scalar_to_pub_key(&scalar1);
        let pub2 = private_scalar_to_pub_key(&scalar2);

        let combined_pub = combine_two_public_keys(&pub1, &pub2).unwrap();

        let combined_scalar = scalar1 + scalar2;
        let expected_pub = private_scalar_to_pub_key(&combined_scalar);

        assert_eq!(
            combined_pub, expected_pub,
            "P1 + P2 should equal (s1 + s2)*G"
        );
    }

    #[test]
    fn test_circomlib_compatibility() {
        // Test vector from circomlibjs - verified with generate_test_vectors.ts
        let priv_key_hex = "0001020304050607080900010203040506070809000102030405060708090001";
        let priv_bytes = hex::decode(priv_key_hex).unwrap();
        let priv_key = Fq::from_be_bytes_mod_order(&priv_bytes);

        let pub_key = gen_pub_key(&priv_key).unwrap();

        // Expected values from circomlibjs (using Blake2b-256 with dkLen: 32)
        let expected_x = {
            let bytes = BigUint::parse_bytes(
                b"815275785501766158930143812062861956757591144517036355029298638624955532959",
                10,
            )
            .unwrap()
            .to_bytes_be();
            Fq::from_be_bytes_mod_order(&bytes)
        };
        let expected_y = {
            let bytes = BigUint::parse_bytes(
                b"11502593600714997493685783493746252336244734597139625425415627372678949758548",
                10,
            )
            .unwrap()
            .to_bytes_be();
            Fq::from_be_bytes_mod_order(&bytes)
        };

        assert_eq!(pub_key.0, expected_x, "Public key X coordinate mismatch");
        assert_eq!(pub_key.1, expected_y, "Public key Y coordinate mismatch");
    }
}