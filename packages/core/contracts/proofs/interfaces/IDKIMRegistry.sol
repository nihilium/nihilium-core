// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

/**
 * @title IDKIMRegistry
 * @notice Minimal read interface for the time-aware DKIM registry.
 *
 * The registry stores, per (domainNameHash, publicKeyHash), the unix timestamp at
 * which the key was revoked:
 *   - 0                 => never registered (invalid at any time)
 *   - type(uint256).max => registered and not revoked (valid at any time)
 *   - t (otherwise)     => valid only strictly before t (revoked at time t)
 */
interface IDKIMRegistry {
    /**
     * @notice Whether `publicKeyHash` is a valid key for `domainNameHash` at `timestamp`.
     * @return valid true iff `timestamp < revokedAt[domainNameHash][publicKeyHash]`.
     */
    function isKeyHashValidAt(
        bytes32 domainNameHash,
        bytes32 publicKeyHash,
        uint256 timestamp
    )
        external
        view
        returns (bool valid);
}
