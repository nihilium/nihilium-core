/**
 * Baby Jubjub (twisted Edwards, EIP-2494) helpers for the Nihilium registry.
 *
 * Point arithmetic is delegated to `@noble/curves` (the same library used by
 * `@nihilium/zkp-circuits`), which provides constant-time, well-tested
 * implementations of the twisted Edwards group law.
 *
 * This module adds the registry-specific layer on top:
 *   • Schnorr proof-of-knowledge generation (for on-chain key registration)
 *   • Challenge computation functions that mirror each registry contract exactly
 *   • Key derivation via `sk · BASE8` (cofactor-8 generator convention)
 *   • On-chain keyId computation: keccak256(abi.encodePacked(x, y))
 *
 * The `babyJub` export is the full Noble curve instance — callers that need
 * ElGamal, Poseidon hashing, or ZK proof inputs should use
 * `@nihilium/zkp-circuits` which re-exports the same curve with richer utilities.
 */

import { twistedEdwards } from "@noble/curves/abstract/edwards";
import { Field } from "@noble/curves/abstract/modular";
import { sha512 } from "@noble/hashes/sha512";
import { randomBytes } from "@noble/hashes/utils";
import { keccak256, solidityPacked } from "ethers";

// ---------------------------------------------------------------------------
// Curve setup  (identical to zkp-circuits/src/utils/types.ts)
// ---------------------------------------------------------------------------

const Fp = Field(21888242871839275222246405745257275088548364400416034343698204186575808495617n);

/**
 * The Baby Jubjub curve configured via `@noble/curves/abstract/edwards`.
 * Generator `BASE` is the cofactor-8 point (BASE8 in BabyJubJub.sol).
 * This is the same instance exported by `@nihilium/zkp-circuits` as `babyJub`.
 */
export const babyJub = twistedEdwards({
  a:          Fp.create(168700n),
  d:          Fp.create(168696n),
  Fp,
  // Full group order n = 8 · subgroup_order
  n:          21888242871839275222246405745257275088614511777268538073601725287587578984328n,
  h:          8n,
  Gx:         5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  Gy:         16950150798460657717958625567821834550301663161624707787222815936182638968203n,
  hash:       sha512,
  randomBytes,
} as const);

export type BabyJubPoint = ReturnType<typeof babyJub.ExtendedPoint.fromAffine>;

// ---------------------------------------------------------------------------
// Constants exported for external use / matching with BabyJubJub.sol
// ---------------------------------------------------------------------------

/** BN254 scalar field prime — base field of Baby Jubjub */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Prime order of the BASE8 subgroup.
 * Schnorr and EdDSA scalar arithmetic is done modulo this value, matching
 * `ORDER` in `BabyJubJub.sol`.
 */
export const ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;

/** Cofactor-8 generator x-coordinate (matches BASE8_X in BabyJubJub.sol) */
export const BASE8_X =
  5299619240641551281634865583518297030282874472190772894086521144482721001553n;

/** Cofactor-8 generator y-coordinate */
export const BASE8_Y =
  16950150798460657717958625567821834550301663161624707787222815936182638968203n;

const BASE8 = babyJub.ExtendedPoint.BASE;

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Parse a 0x-prefixed 32-byte hex private key into a bigint scalar
 * reduced modulo ORDER (the BASE8 subgroup order).
 */
export function parsePrivateKey(hexKey: string): bigint {
  const normalised = hexKey.startsWith("0x") ? hexKey : `0x${hexKey}`;
  const sk = BigInt(normalised);
  return ((sk % ORDER) + ORDER) % ORDER;
}

/**
 * Derive the Baby Jubjub public key for a given private key.
 * Convention: `pk = sk · BASE8`  (cofactor-8, matching circomlibjs / BabyJubJub.sol).
 *
 * @returns `[x, y]` affine coordinates of the public key point
 */
export function privateToPublic(hexKey: string): [bigint, bigint] {
  const sk = parsePrivateKey(hexKey);
  const pk = BASE8.multiply(sk).toAffine();
  return [pk.x, pk.y];
}

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
 * Compute the registry key ID: `keccak256(abi.encodePacked(keyX, keyY))`
 * This matches the `keccak256(abi.encodePacked(keyX, keyY))` in both registry
 * contracts.
 */
export function keyId(keyX: bigint, keyY: bigint): string {
  return keccak256(solidityPacked(["uint256", "uint256"], [keyX, keyY]));
}

// ---------------------------------------------------------------------------
// Challenge computation  (mirrors each registry's addKey challenge exactly)
// ---------------------------------------------------------------------------

/**
 * Compute the Schnorr challenge for ProcessorRegistry.addKey:
 *
 *   keccak256(abi.encodePacked(
 *     msg.sender, keyX, keyY, uint256(keyType), address(this), block.chainid
 *   )) % ORDER
 *
 * @param sender          Ethereum address of the registering processor
 * @param keyX            Public key x-coordinate
 * @param keyY            Public key y-coordinate
 * @param keyType         0 = HE, 1 = Signing
 * @param contractAddress ProcessorRegistry contract address
 * @param chainId         EVM chain ID
 */
export function buildProcessorKeyChallenge(
  sender: string,
  keyX: bigint,
  keyY: bigint,
  keyType: 0 | 1,
  contractAddress: string,
  chainId: bigint
): bigint {
  const hash = keccak256(
    solidityPacked(
      ["address", "uint256", "uint256", "uint256", "address", "uint256"],
      [sender, keyX, keyY, BigInt(keyType), contractAddress, chainId]
    )
  );
  return BigInt(hash) % ORDER;
}

/**
 * Compute the Schnorr challenge for DatastreamRegistry.addKey
 * (no `keyType` in the pre-image):
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

/**
 * Generate a random scalar in [1, ORDER) using a CSPRNG.
 */
function randomScalar(): bigint {
  let r: bigint;
  do {
    const bytes = randomBytes(32);
    r = BigInt("0x" + Buffer.from(bytes).toString("hex")) % ORDER;
  } while (r === 0n);
  return r;
}

/**
 * Generate a Schnorr proof-of-knowledge for `hexSk`.
 *
 * Protocol (matches BabyJubJub.sol `verifySchnorr`):
 *   sk  = private key (mod ORDER)
 *   r   = random nonce in [1, ORDER)
 *   R   = r · BASE8
 *   s   = (r + challenge · sk) mod ORDER
 *
 * Verification on-chain:  s · BASE8  ==  R + challenge · pk
 *
 * @param hexSk     0x-prefixed 32-byte private key
 * @param challenge Context-bound challenge (mod ORDER), from
 *                  `buildProcessorKeyChallenge` or `buildDatastreamKeyChallenge`
 */
export function generateSchnorrProof(hexSk: string, challenge: bigint): SchnorrProof {
  const sk = parsePrivateKey(hexSk);
  const r = randomScalar();
  const R = BASE8.multiply(r).toAffine();
  const s = (r + ((challenge * sk) % ORDER)) % ORDER;
  return { Rx: R.x, Ry: R.y, s };
}
