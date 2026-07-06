/**
 * Baby Jubjub registry helpers — Solidity-encoding layer only.
 *
 * Key derivation is NOT done here. Callers must obtain the correct scalar
 * and public key from @nihilium/zkp-circuits before calling into this module:
 *
 *   HE keys    → cryptoTools.deriveHEPublicKey(hexKey)
 *               cryptoTools.deriveHEKeyScalar(hexKey)
 *
 *   Signing keys → cryptoTools.deriveSigningPublicKey(hexKey)   (async)
 *                  cryptoTools.deriveSigningKeyScalar(hexKey)   (async)
 *
 * This module provides:
 *   • keyId          — keccak256(abi.encodePacked(x, y)), matching the contracts
 *   • Challenge builders that mirror the on-chain pre-images exactly
 *   • generateSchnorrProof — takes a pre-derived scalar, not a raw private key
 *   • Curve membership helpers (isOnCurve / isIdentity) for validation
 *
 * The underlying curve arithmetic (BASE8 multiply) still lives here so that
 * the registry package does not need to depend on ffjavascript or circomlibjs.
 */

import { twistedEdwards } from "@noble/curves/abstract/edwards";
import { Field }          from "@noble/curves/abstract/modular";
import { sha512 }         from "@noble/hashes/sha512";
import { randomBytes }    from "@noble/hashes/utils";
import { keccak256, solidityPacked } from "ethers";

// ---------------------------------------------------------------------------
// Curve instance  (identical parameters to zkp-circuits/src/utils/types.ts)
// ---------------------------------------------------------------------------

const Fp = Field(21888242871839275222246405745257275088548364400416034343698204186575808495617n);

export const babyJub = twistedEdwards({
  a:          Fp.create(168700n),
  d:          Fp.create(168696n),
  Fp,
  n:          21888242871839275222246405745257275088614511777268538073601725287587578984328n,
  h:          8n,
  Gx:         5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  Gy:         16950150798460657717958625567821834550301663161624707787222815936182638968203n,
  hash:       sha512,
  randomBytes,
} as const);

export type BabyJubPoint = ReturnType<typeof babyJub.ExtendedPoint.fromAffine>;

// ---------------------------------------------------------------------------
// Public constants (for callers that need them, e.g. tests)
// ---------------------------------------------------------------------------

export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Prime order of the BASE8 subgroup — scalar arithmetic is mod this */
export const ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;

export const BASE8_X =
  5299619240641551281634865583518297030282874472190772894086521144482721001553n;

export const BASE8_Y =
  16950150798460657717958625567821834550301663161624707787222815936182638968203n;

const BASE8 = babyJub.ExtendedPoint.BASE;

// ---------------------------------------------------------------------------
// Curve membership helpers
// ---------------------------------------------------------------------------

export function isIdentity(x: bigint, y: bigint): boolean {
  return x === 0n && y === 1n;
}

export function isOnCurve(x: bigint, y: bigint): boolean {
  try {
    babyJub.ExtendedPoint.fromAffine({ x, y }).assertValidity();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// On-chain key identifier
// ---------------------------------------------------------------------------

/**
 * keccak256(abi.encodePacked(keyX, keyY))
 * Matches the key ID computed in both registry contracts.
 */
export function keyId(keyX: bigint, keyY: bigint): string {
  //console.log('keyId', keyX, keyY);
  return keccak256(solidityPacked(["uint256", "uint256"], [keyX, keyY]));
}

// ---------------------------------------------------------------------------
// Challenge computation  (mirrors each registry's addKey challenge exactly)
// ---------------------------------------------------------------------------

/**
 * Schnorr challenge for ProcessorRegistry.addKey:
 *
 *   HE keys:
 *     keccak256(abi.encodePacked(
 *       msg.sender, keyX, keyY, uint256(keyType), address(this), block.chainid
 *     )) % ORDER
 *
 *   Signing keys (canonical uint256 secret, no leading-zero byte semantics):
 *     keccak256(abi.encodePacked(
 *       msg.sender, keyX, keyY, uint256(keyType), keyMaterial,
 *       address(this), block.chainid
 *     )) % ORDER
 *
 * keyType: 0 = HE, 1 = Signing
 */
export function buildProcessorKeyChallenge(
  sender: string,
  keyX: bigint,
  keyY: bigint,
  keyType: 0 | 1,
  contractAddress: string,
  chainId: bigint,
  keyMaterial: bigint = 0n
): bigint {
  const types =
    keyType === 1
      ? (["address", "uint256", "uint256", "uint256", "uint256", "address", "uint256"] as const)
      : (["address", "uint256", "uint256", "uint256", "address", "uint256"] as const);
  const values =
    keyType === 1
      ? [sender, keyX, keyY, BigInt(keyType), keyMaterial, contractAddress, chainId]
      : [sender, keyX, keyY, BigInt(keyType), contractAddress, chainId];

  const hash = keccak256(solidityPacked(types, values));
  return BigInt(hash) % ORDER;
}

/**
 * Schnorr challenge for DatastreamRegistry.addKey (no keyType in pre-image):
 *
 *   keccak256(abi.encodePacked(
 *     msg.sender, keyX, keyY, address(this), block.chainid
 *   )) % ORDER
 */
export function buildDatastreamKeyChallenge(
  sender: string,
  keyX: bigint,
  keyY: bigint,
  contractAddress: string,
  chainId: bigint
): bigint {
  const hash = keccak256(
    solidityPacked(
      ["address", "uint256", "uint256", "address", "uint256"],
      [sender, keyX, keyY, contractAddress, chainId]
    )
  );
  return BigInt(hash) % ORDER;
}

// ---------------------------------------------------------------------------
// Schnorr proof-of-knowledge
// ---------------------------------------------------------------------------

export interface SchnorrProof {
  Rx: bigint;
  Ry: bigint;
  s: bigint;
}

function randomScalar(): bigint {
  let r: bigint;
  do {
    const bytes = randomBytes(32);
    r = BigInt("0x" + Buffer.from(bytes).toString("hex")) % ORDER;
  } while (r === 0n);
  return r;
}

/**
 * Generate a Schnorr proof-of-knowledge given a pre-derived scalar.
 *
 * The caller is responsible for passing the correct scalar for the key type:
 *   HE keys:      cryptoTools.deriveHEKeyScalar(hexKey)
 *   Signing keys: await cryptoTools.deriveSigningKeyScalar(hexKey)
 *
 * Protocol (matches BabyJubJub.sol verifySchnorr):
 *   r   = random nonce ∈ [1, ORDER)
 *   R   = r · BASE8
 *   s   = (r + challenge · scalar) mod ORDER
 *
 * Verification on-chain:  s · BASE8 == R + challenge · pk
 *
 * @param scalar    Pre-derived private scalar (NOT the raw hex private key)
 * @param challenge Context-bound challenge (mod ORDER)
 */
export function generateSchnorrProof(scalar: bigint, challenge: bigint): SchnorrProof {
  const r = randomScalar();
  const R = BASE8.multiply(r).toAffine();
  const s = (r + ((challenge * scalar) % ORDER)) % ORDER;
  return { Rx: R.x, Ry: R.y, s };
}
