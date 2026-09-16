// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVerifier.sol";

/**
 * @title LearnedCallProxyProof
 * @notice Routes a chained-proof step to one of many verifiers, using a mapping copied once from
 *         an upstream registry and then held permanently.
 *
 * The sibling FixedCallProxyProof solves the same routing problem with a constructor-fixed
 * allowlist, and ZKEmailProof builds on it. This variant exists for upstreams that are not ours:
 * when the registry naming the correct verifier is administered by a third party who can pause it
 * or remove entries, depending on it at proving time hands them a switch over every seal.
 *
 * So the upstream is treated as the source of truth, but not as a live dependency:
 *
 *   - `_learn` copies an upstream answer into storage, where it is immutable. Subclasses are meant
 *     to expose this permissionlessly, which is safe as long as the address comes from the
 *     upstream and never from the caller -- otherwise anyone could register a circuit of their own
 *     that verifies anything.
 *   - A later removal upstream cannot retract what was already learned.
 *   - `_recordBan` stamps *when* an entry was retired upstream. Proofs dated before the stamp keep
 *     verifying; proofs dated at or after it stop. A retirement is honoured going forward without
 *     invalidating what was already issued.
 *
 * There is deliberately no owner, pause or upgrade path -- any of them would reintroduce the
 * vector this contract exists to remove.
 *
 * @dev `verify` is reached by STATICCALL from ChainedProofV2 and must not write, which is why
 *      learning and ban-recording are separate transactions. It returns a boolean rather than
 *      reverting: a module's forking proof is compiled with verifier_must_be_true = false, so both
 *      answers are meaningful, and a revert surfaces only as an opaque Panic(0x01) from the
 *      chain's assert.
 */
abstract contract LearnedCallProxyProof is IVerifier {
    /// @notice Routing key -> verifier. Written once, never overwritten or cleared.
    mapping(bytes32 => address) public verifiers;
    /// @notice Routing key -> unix time upstream retirement was observed. 0 = still current.
    mapping(bytes32 => uint64) public bannedAt;

    event VerifierLearned(bytes32 indexed key, address indexed verifier);
    event BanRecorded(bytes32 indexed key, uint64 at);

    /**
     * @dev Index into `publicSignals` of the proof's own timestamp, used to decide whether a proof
     *      predates a recorded ban. Indices include the routing signal at 0.
     */
    function _proofTimestampIndex() internal pure virtual returns (uint256);

    function _learn(bytes32 key, address verifier) internal {
        require(verifiers[key] == address(0), "Already learned");
        require(verifier != address(0), "Unknown upstream");
        require(verifier.code.length > 0, "Verifier has no code");
        verifiers[key] = verifier;
        emit VerifierLearned(key, verifier);
    }

    function _recordBan(bytes32 key) internal {
        require(verifiers[key] != address(0), "Not learned");
        require(bannedAt[key] == 0, "Already recorded");
        bannedAt[key] = uint64(block.timestamp);
        emit BanRecorded(key, uint64(block.timestamp));
    }

    /**
     * @dev publicSignals[0] is the routing key; publicSignals[1:] is the inner verifier's own
     *      input array, passed through untouched.
     */
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs)
        external
        view
        virtual
        override
        returns (bool)
    {
        if (_publicInputs.length <= _proofTimestampIndex()) {
            return false;
        }
        bytes32 key = _publicInputs[0];
        address verifier = verifiers[key];
        if (verifier == address(0)) {
            return false;
        }
        uint64 ban = bannedAt[key];
        if (ban != 0 && uint256(_publicInputs[_proofTimestampIndex()]) >= ban) {
            return false;
        }
        return IVerifier(verifier).verify(_proof, _publicInputs[1:]);
    }
}
