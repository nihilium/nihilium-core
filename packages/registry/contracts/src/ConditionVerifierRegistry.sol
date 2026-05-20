// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Interfaces.sol";

/// @title ConditionVerifierRegistry
/// @notice Committee-gated registry of approved unseal condition verifier
///         contracts (§3.5, §5.1, §5.5).
///
///         Verifier contracts must satisfy the IVerifier interface:
///           verify(bytes calldata proof, bytes32[] calldata publicSignals) → bool
///
///         Required properties (§5.1):
///           • Pure / deterministic — same inputs always produce the same output.
///           • Stateless — no on-chain state access during verification.
///           • Non-upgradeable — immutable logic; no proxy patterns.
///
///         The registry captures each verifier's bytecode hash (extcodehash) at
///         registration time.  Processors MUST call `verifyIntegrity` before
///         executing a proof chain step (§5.5) to confirm the live bytecode has
///         not changed.  A mismatch indicates an upgrade proxy was used and the
///         committee should deregister the verifier.
///
///         Deregistration preserves the entry (active = false) so off-chain
///         tooling can still confirm that a verifier WAS valid at some point
///         in time, and to enable historical slash challenges that reference it.
contract ConditionVerifierRegistry is IConditionVerifierRegistry {

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct VerifierInfo {
        bool    active;
        /// @dev extcodehash of the verifier contract at registration time.
        ///      Used to detect proxy upgrades (§5.1 immutability requirement).
        bytes32 codeHash;
        /// @dev Human-readable description for off-chain tooling.
        string  description;
        /// @dev Block number when the verifier was registered.
        uint256 registeredAtBlock;
        /// @dev Block number when the verifier was deregistered (0 if still active).
        uint256 deregisteredAtBlock;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => VerifierInfo) public verifiers;

    /// @dev Ordered list of all verifier addresses ever registered.
    address[] private _allVerifiers;

    address public committee;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event VerifierRegistered(
        address indexed verifier,
        bytes32 codeHash,
        string  description,
        uint256 atBlock
    );

    event VerifierDeregistered(
        address indexed verifier,
        uint256 atBlock
    );

    event CommitteeTransferred(address indexed oldCommittee, address indexed newCommittee);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyCommittee() {
        require(msg.sender == committee, "ConditionVerifierRegistry: not committee");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _committee) {
        require(_committee != address(0), "ConditionVerifierRegistry: zero address");
        committee = _committee;
    }

    // -------------------------------------------------------------------------
    // Committee — registration
    // -------------------------------------------------------------------------

    /// @notice Register a new condition verifier contract.
    ///
    ///         The committee is responsible for confirming:
    ///           1. The contract satisfies the IVerifier interface.
    ///           2. The contract is non-upgradeable (no proxy pattern).
    ///           3. The logic is deterministic and stateless.
    ///
    ///         The bytecode hash is captured here to enable future integrity
    ///         checks by processors at runtime.
    ///
    /// @param verifier     Address of the verifier contract.
    /// @param description  Human-readable label (e.g. "Groth16 opening proof v1").
    function register(address verifier, string calldata description) external onlyCommittee {
        require(verifier != address(0), "ConditionVerifierRegistry: zero address");
        require(!verifiers[verifier].active, "ConditionVerifierRegistry: already registered");

        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(verifier)
        }
        require(codeHash != bytes32(0), "ConditionVerifierRegistry: no code at address");

        if (verifiers[verifier].registeredAtBlock == 0) {
            // First time this address is registered — add to enumeration list.
            _allVerifiers.push(verifier);
        }

        verifiers[verifier] = VerifierInfo({
            active:              true,
            codeHash:            codeHash,
            description:         description,
            registeredAtBlock:   block.number,
            deregisteredAtBlock: 0
        });

        emit VerifierRegistered(verifier, codeHash, description, block.number);
    }

    /// @notice Deregister a verifier.
    ///
    ///         Sets `active = false` but preserves the record so that:
    ///           • Historical proofs referencing the verifier remain auditable.
    ///           • Slashing challenges submitted after deregistration can still
    ///             confirm the verifier was approved at sealing time.
    ///
    ///         A deregistered verifier MAY be re-registered (e.g. after a
    ///         redeployment with the same logic to a new address), which will
    ///         update the record with the new registration block and code hash.
    function deregister(address verifier) external onlyCommittee {
        require(verifiers[verifier].active, "ConditionVerifierRegistry: not active");

        verifiers[verifier].active              = false;
        verifiers[verifier].deregisteredAtBlock = block.number;

        emit VerifierDeregistered(verifier, block.number);
    }

    // -------------------------------------------------------------------------
    // Governance
    // -------------------------------------------------------------------------

    function transferCommittee(address newCommittee) external onlyCommittee {
        require(newCommittee != address(0), "ConditionVerifierRegistry: zero address");
        emit CommitteeTransferred(committee, newCommittee);
        committee = newCommittee;
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @inheritdoc IConditionVerifierRegistry
    function isRegistered(address verifier) external view override returns (bool) {
        return verifiers[verifier].active;
    }

    /// @notice Returns true if the verifier is active AND its live bytecode
    ///         still matches the hash captured at registration.
    ///
    ///         Processors MUST call this before executing any proof-chain step
    ///         (§5.5).  A false return means the contract bytecode has changed
    ///         — indicating a proxy upgrade — and the processor should refuse
    ///         to use the verifier and report the discrepancy.
    /// @inheritdoc IConditionVerifierRegistry
    function verifyIntegrity(address verifier) external view override returns (bool) {
        VerifierInfo storage info = verifiers[verifier];
        if (!info.active) return false;

        bytes32 liveHash;
        assembly {
            liveHash := extcodehash(verifier)
        }
        return liveHash == info.codeHash;
    }

    /// @notice Returns the stored code hash for a verifier (active or not).
    function getCodeHash(address verifier) external view returns (bytes32) {
        return verifiers[verifier].codeHash;
    }

    function getVerifierInfo(address verifier) external view returns (VerifierInfo memory) {
        return verifiers[verifier];
    }

    /// @notice Returns all verifier addresses ever registered (including deregistered).
    ///         Use `isRegistered` to filter to the current active set.
    function getAllVerifiers() external view returns (address[] memory) {
        return _allVerifiers;
    }

    /// @notice Returns only currently active verifier addresses.
    function getActiveVerifiers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _allVerifiers.length; ) {
            if (verifiers[_allVerifiers[i]].active) ++count;
            unchecked { ++i; }
        }
        address[] memory result = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < _allVerifiers.length; ) {
            if (verifiers[_allVerifiers[i]].active) {
                result[j] = _allVerifiers[i];
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
        return result;
    }

    /// @notice Returns whether a verifier was approved at a specific block height.
    ///         Useful for off-chain tooling to confirm a seal used a valid
    ///         verifier at the time of sealing.
    function wasRegisteredAt(address verifier, uint256 blockNumber) external view returns (bool) {
        VerifierInfo storage info = verifiers[verifier];
        if (info.registeredAtBlock == 0) return false;
        if (blockNumber < info.registeredAtBlock) return false;
        if (info.deregisteredAtBlock != 0 && blockNumber >= info.deregisteredAtBlock) return false;
        return true;
    }
}
