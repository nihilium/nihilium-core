// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Poseidon2Lib} from "poseidon2-evm/src/Poseidon2Lib.sol";
import {Field} from "poseidon2-evm/src/Field.sol";

/// @title BabyJubJub
/// @notice Twisted Edwards curve (EIP-2494) arithmetic in Solidity.
///
///         Curve equation (over the BN254 scalar field):
///           a * x² + y² = 1 + d * x² * y²
///           a = 168700, d = 168696
///
///         Generator used throughout is BASE8 — the cofactor-8 multiple of the
///         canonical generator — which is the convention used by circomlibjs,
///         iden3, and the rest of this codebase.
///
///         Schnorr proofs-of-knowledge:
///           Prover holds sk s.t.  pk = sk · BASE8
///           Prover picks nonce r,  publishes R = r · BASE8
///           Contract computes challenge c (keccak-derived, bound to registration context)
///           Prover supplies s = (r + c·sk) mod ORDER
///           Contract verifies  s · BASE8 == R + c · pk
///
///         All internal functions are `view` because field inversion uses the
///         modexp precompile (address 0x05) via staticcall.
library BabyJubJub {
    // -------------------------------------------------------------------------
    // Curve constants  (EIP-2494 / circomlibjs specification)
    // -------------------------------------------------------------------------

    /// @dev BN254 scalar field prime — the base field of Baby Jubjub
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @dev Prime order of the BASE8 subgroup
    uint256 internal constant ORDER =
        2736030358979909402780800718157159386076813972158567259200215660948447373041;

    /// @dev Twist parameter a
    uint256 internal constant A = 168700;
    /// @dev Twist parameter d
    uint256 internal constant D = 168696;

    /// @dev BASE8 generator x-coordinate (cofactor·G, from EIP-2494)
    uint256 internal constant BASE8_X =
        5299619240641551281634865583518297030282874472190772894086521144482721001553;

    /// @dev BASE8 generator y-coordinate
    uint256 internal constant BASE8_Y =
        16950150798460657717958625567821834550301663161624707787222815936182638968203;

    // FIELD_MODULUS - 2, used as the Fermat exponent for inversion.
    // p - 2 = 0x30644e72e131a029b85045b68181585d2833e84879b9709142e0f853d68297ff
    uint256 private constant _P_MINUS_2 =
        21888242871839275222246405745257275088548364400416034343698204186575808495615;

    // -------------------------------------------------------------------------
    // Field arithmetic
    // -------------------------------------------------------------------------

    function _fadd(uint256 a, uint256 b) private pure returns (uint256) {
        return addmod(a, b, FIELD_MODULUS);
    }

    function _fsub(uint256 a, uint256 b) private pure returns (uint256) {
        // addmod handles the wrap-around: a - b ≡ a + (p - b) mod p
        return addmod(a, FIELD_MODULUS - (b % FIELD_MODULUS), FIELD_MODULUS);
    }

    function _fmul(uint256 a, uint256 b) private pure returns (uint256) {
        return mulmod(a, b, FIELD_MODULUS);
    }

    /// @dev Modular inverse via Fermat: a^(p-2) mod p, using precompile 0x05.
    function _finv(uint256 a) private view returns (uint256 result) {
        require(a != 0, "BabyJubJub: zero has no inverse");
        assembly {
            let ptr := mload(0x40)
            mstore(ptr,        0x20)          // base length  (32 bytes)
            mstore(add(ptr, 0x20), 0x20)      // exp length   (32 bytes)
            mstore(add(ptr, 0x40), 0x20)      // mod length   (32 bytes)
            mstore(add(ptr, 0x60), a)         // base
            mstore(add(ptr, 0x80), _P_MINUS_2) // exponent p-2
            mstore(add(ptr, 0xa0), FIELD_MODULUS) // modulus
            let ok := staticcall(gas(), 5, ptr, 0xc0, ptr, 0x20)
            if iszero(ok) { revert(0, 0) }
            result := mload(ptr)
        }
    }

    // -------------------------------------------------------------------------
    // Curve operations
    // -------------------------------------------------------------------------

    /// @dev Twisted Edwards point addition.
    ///      Identity element is (0, 1).
    ///      Formula:
    ///        x₃ = (x₁·y₂ + y₁·x₂) / (1 + d·x₁·x₂·y₁·y₂)
    ///        y₃ = (y₁·y₂ − a·x₁·x₂) / (1 − d·x₁·x₂·y₁·y₂)
    ///
    ///      Optimised to use a single field inversion by computing:
    ///        t  = d·x₁·x₂·y₁·y₂
    ///        inv_prod = inv((1+t)(1-t)) = inv(1 - t²)
    ///        inv(1+t) = inv_prod · (1-t)
    ///        inv(1-t) = inv_prod · (1+t)
    function pointAdd(uint256 ax, uint256 ay, uint256 bx, uint256 by)
        internal
        view
        returns (uint256 rx, uint256 ry)
    {
        uint256 t = _fmul(_fmul(D, _fmul(ax, bx)), _fmul(ay, by));

        // denom_prod = 1 - t²
        uint256 denomProd = _fsub(1, _fmul(t, t));
        uint256 invDenomProd = _finv(denomProd);

        // inv(1 + t)  =  invDenomProd · (1 - t)
        uint256 invPlusT = _fmul(invDenomProd, _fsub(1, t));
        // inv(1 - t)  =  invDenomProd · (1 + t)
        uint256 invMinusT = _fmul(invDenomProd, _fadd(1, t));

        // x₃ = (ax·by + ay·bx) · inv(1+t)
        rx = _fmul(_fadd(_fmul(ax, by), _fmul(ay, bx)), invPlusT);
        // y₃ = (ay·by − A·ax·bx) · inv(1-t)
        ry = _fmul(_fsub(_fmul(ay, by), _fmul(A, _fmul(ax, bx))), invMinusT);
    }

    /// @dev Scalar multiplication via double-and-add.
    ///      `scalar` is reduced mod ORDER before use.
    ///      Returns the identity (0, 1) for scalar == 0.
    function scalarMul(uint256 scalar, uint256 px, uint256 py)
        internal
        view
        returns (uint256 rx, uint256 ry)
    {
        // Identity element
        rx = 0;
        ry = 1;

        scalar = scalar % ORDER;
        if (scalar == 0) return (rx, ry);

        uint256 qx = px;
        uint256 qy = py;

        while (scalar > 0) {
            if (scalar & 1 == 1) {
                (rx, ry) = pointAdd(rx, ry, qx, qy);
            }
            (qx, qy) = pointAdd(qx, qy, qx, qy);
            scalar >>= 1;
        }
    }

    // -------------------------------------------------------------------------
    // Schnorr proof-of-knowledge
    // -------------------------------------------------------------------------

    /// @notice Verify a Schnorr proof of knowledge of the discrete log of `pk`
    ///         with respect to BASE8.
    ///
    ///         Proof: (Rx, Ry, s) where
    ///           R      = r · BASE8                 (prover-chosen commitment)
    ///           s      = (r + challenge · sk) mod ORDER
    ///           challenge provided by caller (bound to registration context)
    ///
    ///         Verification:  s · BASE8  ==  R + challenge · pk
    ///
    /// @param pkX        Public key x-coordinate (BJJ point)
    /// @param pkY        Public key y-coordinate
    /// @param Rx         Commitment R x-coordinate
    /// @param Ry         Commitment R y-coordinate
    /// @param s          Response scalar (mod ORDER)
    /// @param challenge  Context-bound challenge (already reduced mod ORDER)
    function verifySchnorr(
        uint256 pkX,
        uint256 pkY,
        uint256 Rx,
        uint256 Ry,
        uint256 s,
        uint256 challenge
    ) internal view returns (bool) {
        // LHS: s · BASE8
        (uint256 lhsX, uint256 lhsY) = scalarMul(s, BASE8_X, BASE8_Y);

        // RHS: R + challenge · pk
        (uint256 cPkX, uint256 cPkY) = scalarMul(challenge, pkX, pkY);
        (uint256 rhsX, uint256 rhsY) = pointAdd(Rx, Ry, cPkX, cPkY);

        return lhsX == rhsX && lhsY == rhsY;
    }

    // -------------------------------------------------------------------------
    // EdDSA verification  (Baby Jubjub + Poseidon2 challenge hash)
    // -------------------------------------------------------------------------

    /// @notice Verify a Baby Jubjub EdDSA signature whose challenge is computed
    ///         with Poseidon2 — the same convention used by the Poseidon2.sol
    ///         verifier in `packages/core/contracts/proofs/`.
    ///
    ///         Signature scheme:
    ///           Private key  sk            (scalar mod ORDER)
    ///           Public key   A  = sk · BASE8
    ///           Nonce        r  (random scalar mod ORDER)
    ///           Commitment   R8 = r · BASE8
    ///           Challenge    h  = Poseidon2(R8.x, A.x, M) mod ORDER
    ///           Response     S  = (r + h · sk) mod ORDER
    ///
    ///         Verification:  S · BASE8  ==  R8 + h · A
    ///
    ///         The 3-input Poseidon2 hash is consistent with `Poseidon2Verifier`
    ///         in the core package: `Poseidon2Lib.hash_3(R8x, Ax, M)`.
    ///
    ///         `M` is accepted as a raw uint256.  Values that exceed the
    ///         Poseidon2 field prime are passed through unchecked (no wrap-around
    ///         reduction is applied by the library itself; the caller is
    ///         responsible for keeping M within the field when producing
    ///         signatures off-chain).
    ///
    /// @param Ax   Signer public key x-coordinate (BJJ point)
    /// @param Ay   Signer public key y-coordinate
    /// @param R8x  Signature commitment R8 x-coordinate
    /// @param R8y  Signature commitment R8 y-coordinate
    /// @param S    Signature response scalar
    /// @param M    Message (field element, e.g. keccak256 digest reduced mod FIELD_MODULUS)
    function verifyEdDSA(
        uint256 Ax,
        uint256 Ay,
        uint256 R8x,
        uint256 R8y,
        uint256 S,
        uint256 M
    ) internal view returns (bool) {
        // h = Poseidon2(R8.x, A.x, M) mod ORDER
        // BJJ coordinates are guaranteed < FIELD_MODULUS < Field.PRIME so the
        // checked Field.toField conversion is safe.  M is passed unchecked.
        Field.Type h3 = Poseidon2Lib.hash_3(
            Field.toField(bytes32(R8x)),
            Field.toField(bytes32(Ax)),
            Field.toFieldUnchecked(bytes32(M))
        );
        uint256 h = uint256(Field.toBytes32(h3)) % ORDER;

        // LHS: S · BASE8
        (uint256 lhsX, uint256 lhsY) = scalarMul(S, BASE8_X, BASE8_Y);

        // RHS: R8 + h · A
        (uint256 hAx, uint256 hAy) = scalarMul(h, Ax, Ay);
        (uint256 rhsX, uint256 rhsY) = pointAdd(R8x, R8y, hAx, hAy);

        return lhsX == rhsX && lhsY == rhsY;
    }

    // -------------------------------------------------------------------------
    // Signing key material (canonical uint256, no leading-zero byte semantics)
    // -------------------------------------------------------------------------

    /// @dev Reduce secret material to a valid BASE8 subgroup scalar.
    ///      `keyMaterial` is the integer value of the env secret (0x-prefixed hex
    ///      interpreted as uint256).  Leading zero nybbles in the hex encoding are
    ///      not distinguished: 0x00abc and 0xabc yield the same material.
    function normalizeSigningScalar(uint256 keyMaterial) internal pure returns (uint256) {
        return keyMaterial % ORDER;
    }

    /// @dev Signing public key from canonical secret material: pk = sk · BASE8
    ///      where sk = normalizeSigningScalar(keyMaterial).
    function deriveSigningPublicKey(uint256 keyMaterial)
        internal
        view
        returns (uint256 x, uint256 y)
    {
        return scalarMul(normalizeSigningScalar(keyMaterial), BASE8_X, BASE8_Y);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /// @dev Reduce a keccak256 digest to a scalar in [0, ORDER).
    ///      Callers construct the pre-image; this just does the modular reduction.
    function hashToScalar(bytes32 digest) internal pure returns (uint256) {
        return uint256(digest) % ORDER;
    }

    /// @dev Check whether (x, y) is the identity element (0, 1).
    function isIdentity(uint256 x, uint256 y) internal pure returns (bool) {
        return x == 0 && y == 1;
    }

    /// @dev Check whether (x, y) satisfies the curve equation (on-chain sanity check).
    function isOnCurve(uint256 x, uint256 y) internal pure returns (bool) {
        // a·x² + y²  ==  1 + d·x²·y²  (all mod p)
        uint256 x2 = mulmod(x, x, FIELD_MODULUS);
        uint256 y2 = mulmod(y, y, FIELD_MODULUS);
        uint256 lhs = addmod(mulmod(A, x2, FIELD_MODULUS), y2, FIELD_MODULUS);
        uint256 rhs = addmod(1, mulmod(D, mulmod(x2, y2, FIELD_MODULUS), FIELD_MODULUS), FIELD_MODULUS);
        return lhs == rhs;
    }
}
