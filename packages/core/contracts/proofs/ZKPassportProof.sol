// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./LearnedCallProxy.sol";

/// @notice ZKPassport's root verifier. Maps a proof `version` -- the proof's semver packed as
///         3 x uint16 big-endian, right-padded to bytes32 -- to the SubVerifier that knows that
///         generation of circuits.
interface IZKPassportRootVerifier {
    function getSubVerifier(bytes32 version) external view returns (address);
}

/**
 * @title ZKPassportProof
 * @notice Verifies a ZKPassport disclosure proof by routing to the Honk verifier ZKPassport itself
 *         deployed for that circuit, using a mapping learned once and then held permanently.
 *
 * ZKPassport's root verifier and its SubVerifiers share a single admin that can `pause()` them and
 * `removeSubVerifier(version)`. Reading their registry at proving time would let that admin
 * invalidate every seal ever made against a passport condition. Learning the mapping into storage
 * removes that: see LearnedCallProxyProof for the shape and its reasoning.
 *
 * Lookup is two levels, which is why `learnVerifier` takes both:
 *   version  -> SubVerifier   via the root verifier's getSubVerifier
 *   vkeyHash -> Honk verifier via the SubVerifier
 *
 * publicSignals[0] is the vkeyHash, consumed as the routing key and stripped; publicSignals[1:] is
 * the circuit's own twelve inputs, of which index 2 (so publicSignals[3] here) is currentDate.
 */
contract ZKPassportProof is LearnedCallProxyProof {
    /// @notice ZKPassport's root verifier. Deterministic address, but only where they deployed.
    address public immutable rootVerifier;

    /**
     * @dev The SubVerifier's `vkeyHash -> Honk verifier` getter. Its source is unverified and the
     *      function has no published name, so it is called by raw selector. Observed behaviour:
     *      takes one bytes32, returns an address word, zero for an unknown key.
     */
    bytes4 private constant SUB_LOOKUP_SELECTOR = 0x1e8e0f8e;

    /// @notice vkeyHash -> the version whose SubVerifier it was learned through.
    mapping(bytes32 => bytes32) public versionOf;

    constructor(address _rootVerifier) {
        require(_rootVerifier != address(0), "Root verifier required");
        require(_rootVerifier.code.length > 0, "No ZKPassport deployment on this chain");
        rootVerifier = _rootVerifier;
    }

    /// @dev publicSignals[0] routing key, then the circuit's inputs; its index 2 is currentDate.
    function _proofTimestampIndex() internal pure override returns (uint256) {
        return 3;
    }

    /**
     * @notice Copy ZKPassport's `vkeyHash -> verifier` answer into this contract permanently.
     *
     * Permissionless on purpose. The address is read from ZKPassport and never taken from the
     * caller, so this cannot be used to register a verifier that accepts anything.
     */
    function learnVerifier(bytes32 version, bytes32 vkeyHash) external {
        address subVerifier = IZKPassportRootVerifier(rootVerifier).getSubVerifier(version);
        require(subVerifier != address(0), "Unknown version upstream");

        _learn(vkeyHash, _lookup(subVerifier, vkeyHash));
        versionOf[vkeyHash] = version;
    }

    /**
     * @notice Stamp the moment ZKPassport retired a circuit this contract had learned.
     *
     * Keyed on the entry actually disappearing upstream, never on `paused()`. A pause is
     * reversible, so treating it as retirement would let anyone permanently degrade this contract
     * by calling during a brief outage.
     */
    function recordBan(bytes32 vkeyHash) external {
        require(verifiers[vkeyHash] != address(0), "Not learned");
        address subVerifier = IZKPassportRootVerifier(rootVerifier).getSubVerifier(versionOf[vkeyHash]);
        bool retired = subVerifier == address(0) || _lookup(subVerifier, vkeyHash) == address(0);
        require(retired, "Still current upstream");
        _recordBan(vkeyHash);
    }

    /// @dev Raw staticcall to the SubVerifier's unnamed `vkeyHash -> verifier` getter.
    function _lookup(address subVerifier, bytes32 vkeyHash) private view returns (address) {
        (bool ok, bytes memory ret) =
            subVerifier.staticcall(abi.encodeWithSelector(SUB_LOOKUP_SELECTOR, vkeyHash));
        if (!ok || ret.length < 32) {
            return address(0);
        }
        return address(uint160(uint256(abi.decode(ret, (bytes32)))));
    }
}
