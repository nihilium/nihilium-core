// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BabyJubJub} from "../contracts/src/lib/BabyJubJub.sol";

/// @dev Exposes internal BabyJubJub helpers for Forge tests.
contract BabyJubJubHarness {
    function verifySchnorr(
        uint256 pkX,
        uint256 pkY,
        uint256 rx,
        uint256 ry,
        uint256 s,
        uint256 challenge
    ) external view returns (bool) {
        return BabyJubJub.verifySchnorr(pkX, pkY, rx, ry, s, challenge);
    }

    function signingChallenge(
        address sender,
        uint256 keyX,
        uint256 keyY,
        uint256 keyType,
        uint256 keyMaterial,
        address registry,
        uint256 chainId
    ) external view returns (uint256) {
        bytes32 digest = keccak256(
            abi.encodePacked(sender, keyX, keyY, keyType, keyMaterial, registry, chainId)
        );
        return BabyJubJub.hashToScalar(digest);
    }

    function heChallenge(
        address sender,
        uint256 keyX,
        uint256 keyY,
        uint256 keyType,
        address registry,
        uint256 chainId
    ) external view returns (uint256) {
        bytes32 digest = keccak256(
            abi.encodePacked(sender, keyX, keyY, keyType, registry, chainId)
        );
        return BabyJubJub.hashToScalar(digest);
    }

    function legacySigningChallenge(
        address sender,
        uint256 keyX,
        uint256 keyY,
        address registry,
        uint256 chainId
    ) external view returns (uint256) {
        bytes32 digest = keccak256(
            abi.encodePacked(sender, keyX, keyY, uint256(1), registry, chainId)
        );
        return BabyJubJub.hashToScalar(digest);
    }
}
