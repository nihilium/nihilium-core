// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Re-use the core IDataStream interface so DatastreamRegistry can validate
// that registered contracts expose the expected API.
import "@nihilium/core/contracts/Interfaces.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Processor Registry
// ─────────────────────────────────────────────────────────────────────────────

interface IProcessorRegistry {
    /// @notice Returns true if `processor` is registered and not slashed.
    function isActive(address processor) external view returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
// Datastream Registry
// ─────────────────────────────────────────────────────────────────────────────

interface IDatastreamRegistry {
    /// @notice Returns true if `operator` is registered, staked, and active.
    function isActiveOperator(address operator) external view returns (bool);

    /// @notice Returns the IDataStream contract address registered by `operator`.
    function getDatastreamContract(address operator) external view returns (address);
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Verifier Registry
// ─────────────────────────────────────────────────────────────────────────────

interface IConditionVerifierRegistry {
    /// @notice Returns true if `verifier` is currently in the approved set.
    function isRegistered(address verifier) external view returns (bool);

    /// @notice Returns true if the live bytecode of `verifier` matches the hash
    ///         captured at registration time, confirming the contract is immutable.
    function verifyIntegrity(address verifier) external view returns (bool);
}
