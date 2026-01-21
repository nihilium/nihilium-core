use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::fs;
use std::path::Path;
use num_bigint::BigUint;
use thiserror::Error;
use ahash::AHashMap;
use std::collections::HashMap as StdHashMap;

mod babyjubjub;
use babyjubjub::{Point, decode as babyjub_decode, fq_to_string, scalar_mul_biguint, point_sub};

#[derive(Error, Debug)]
pub enum DlogSolverError {
    #[error("Failed to load lookup table: {0}")]
    LoadError(String),
    #[error("Lookup table not found for key: {0}")]
    NotFound(String),
    #[error("Invalid point coordinates")]
    InvalidPoint,
    #[error("Invalid precompute size")]
    InvalidPrecomputeSize,
}

#[napi]
pub struct DlogSolver {
    lookup: AHashMap<String, String>,
    precompute_size: u32,
}

#[napi]
impl DlogSolver {
    #[napi(constructor)]
    pub fn new(precompute_size: u32, lookup_table_path: Option<String>) -> Result<Self> {
        let default_path = format!("./lookupTables/x{}xlookupTable.json", precompute_size);
        let path = lookup_table_path.unwrap_or(default_path);
        
        let lookup = load_lookup_table(&path)
            .map_err(|e| Error::from_reason(format!("Failed to load lookup table: {}", e)))?;
        
        Ok(Self {
            lookup,
            precompute_size,
        })
    }

    #[napi]
    pub fn debug_solve(
        &self,
        base_x: String,
        base_y: String,
        encoded_x: String,
        encoded_y: String,
        max_iterations: Option<u32>,
    ) -> Result<String> {
        // Debug version that returns a string with intermediate values
        let base_point = parse_point(&base_x, &base_y)
            .map_err(|e| Error::from_reason(format!("Invalid base point: {}", e)))?;
        let encoded_point = parse_point(&encoded_x, &encoded_y)
            .map_err(|e| Error::from_reason(format!("Invalid encoded point: {}", e)))?;

        let range = 32 - self.precompute_size;
        let range_bound = BigUint::from(2u32).pow(range);
        let max_iter = max_iterations.unwrap_or(10).min(range_bound.to_u64_digits().get(0).copied().unwrap_or(0) as u32);

        let mut debug_info = Vec::new();
        debug_info.push(format!("Range: {}, RangeBound: {}", range, range_bound));
        debug_info.push(format!("Base point x: {}, y: {}", base_x, base_y));
        debug_info.push(format!("Encoded point x: {}, y: {}", encoded_x, encoded_y));

        for xlo_val in 0..max_iter {
            let xlo_big = BigUint::from(xlo_val);
            let lo_base = scalar_mul_biguint(&base_point, &xlo_big);
            let subtracted = point_sub(&encoded_point, &lo_base);
            let key = fq_to_string(&subtracted.x);
            
            debug_info.push(format!("xlo={}, key={}, in_table={}", xlo_val, key, self.lookup.contains_key(&key)));
            
            if self.lookup.contains_key(&key) {
                debug_info.push(format!("FOUND at xlo={}", xlo_val));
                break;
            }
        }

        Ok(debug_info.join("\n"))
    }

    #[napi]
    pub fn solve(
        &self,
        base_x: String,
        base_y: String,
        encoded_x: String,
        encoded_y: String,
    ) -> Result<BigInt> {
        // Parse coordinates
        let base_point = parse_point(&base_x, &base_y)
            .map_err(|e| Error::from_reason(format!("Invalid base point: {}", e)))?;
        let encoded_point = parse_point(&encoded_x, &encoded_y)
            .map_err(|e| Error::from_reason(format!("Invalid encoded point: {}", e)))?;

        // Use the decode function from babyjubjub module
        let result = babyjub_decode(&base_point, &encoded_point, self.precompute_size as usize, &self.lookup)
            .map_err(|e| Error::from_reason(format!("Decode error: {}", e)))?;

        // Convert Fq to BigInt for NAPI
        // Fq implements PrimeField which has into_bigint() method
        use ark_ff::PrimeField;
        let bigint_repr = result.into_bigint();
        // Convert BigInt to bytes - BigInt has to_bytes_be() method
        use ark_ff::BigInteger;
        let bytes = bigint_repr.to_bytes_be();
        let biguint = BigUint::from_bytes_be(&bytes);
        
        // Convert BigUint to BigInt for NAPI
        // Since the result is a 32-bit value (max 2^32-1), we can safely convert it
        let result_u64_digits = biguint.to_u64_digits();
        if result_u64_digits.is_empty() {
            Ok(BigInt::from(0i128))
        } else if result_u64_digits.len() == 1 {
            // Single u64 - can fit in i128
            let val = result_u64_digits[0] as i128;
            Ok(BigInt::from(val))
        } else if result_u64_digits.len() == 2 {
            // Two u64s - combine into i128
            let val = (result_u64_digits[0] as i128) | ((result_u64_digits[1] as i128) << 64);
            Ok(BigInt::from(val))
        } else {
            // More than 2 u64s - convert via string (shouldn't happen for 32-bit values)
            let result_str = biguint.to_string();
            // Parse as i128 string - NAPI BigInt can handle this
            let parsed = result_str.parse::<i128>()
                .map_err(|_| Error::from_reason(format!("Result too large: {}", result_str)))?;
            Ok(BigInt::from(parsed))
        }
    }
}

fn load_lookup_table(path: &str) -> std::result::Result<AHashMap<String, String>, DlogSolverError> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(DlogSolverError::LoadError(format!(
            "Lookup table file not found: {}",
            path
        )));
    }

    let content = fs::read_to_string(file_path)
        .map_err(|e| DlogSolverError::LoadError(format!("Failed to read file: {}", e)))?;

    // Deserialize into standard HashMap first (for serde compatibility)
    let table: StdHashMap<String, String> = serde_json::from_str(&content)
        .map_err(|e| DlogSolverError::LoadError(format!("Failed to parse JSON: {}", e)))?;

    // Convert to AHashMap for faster lookups
    Ok(table.into_iter().collect())
}

fn parse_point(x_str: &str, y_str: &str) -> std::result::Result<Point, DlogSolverError> {
    // Parse x and y as big integers, then convert to field elements
    let x_big = BigUint::parse_bytes(x_str.as_bytes(), 10)
        .ok_or(DlogSolverError::InvalidPoint)?;
    let y_big = BigUint::parse_bytes(y_str.as_bytes(), 10)
        .ok_or(DlogSolverError::InvalidPoint)?;

    // Convert to Fq (BN254 scalar field)
    let x_bytes = x_big.to_bytes_be();
    let y_bytes = y_big.to_bytes_be();
    
    use ark_bn254::Fr as Fq;
    use ark_ff::PrimeField;
    
    let x = Fq::from_be_bytes_mod_order(&x_bytes);
    let y = Fq::from_be_bytes_mod_order(&y_bytes);

    Ok(Point::new(x, y))
}
