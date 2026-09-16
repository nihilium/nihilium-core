// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVerifier.sol";

/// @notice Test double for ZKPassport's root verifier.
contract TestZKPassportRoot {
    mapping(bytes32 => address) public subVerifiers;

    function setSubVerifier(bytes32 version, address subVerifier) external {
        subVerifiers[version] = subVerifier;
    }

    function getSubVerifier(bytes32 version) external view returns (address) {
        return subVerifiers[version];
    }
}

/**
 * @notice Test double for a ZKPassport SubVerifier.
 * @dev The real lookup has no published name, so it is reached by raw selector 0x1e8e0f8e. A
 *      fallback is the only way to answer a selector with no matching signature.
 */
contract TestZKPassportSubVerifier {
    bytes4 private constant LOOKUP_SELECTOR = 0x1e8e0f8e;

    mapping(bytes32 => address) public entries;

    function setVerifier(bytes32 vkeyHash, address verifier) external {
        entries[vkeyHash] = verifier;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        require(input.length == 36 && bytes4(input[:4]) == LOOKUP_SELECTOR, "unexpected selector");
        bytes32 vkeyHash = abi.decode(input[4:], (bytes32));
        return abi.encode(bytes32(uint256(uint160(entries[vkeyHash]))));
    }
}

/**
 * @notice A verifier that answers true only when handed exactly the inputs it was told to expect.
 * @dev Reached by STATICCALL, so it cannot record what it saw; asserting is the only option.
 */
contract TestExpectInputs is IVerifier {
    uint256 public expectedLength;
    bytes32 public expectedFirst;
    bool public configured;

    function expect(uint256 length, bytes32 first) external {
        expectedLength = length;
        expectedFirst = first;
        configured = true;
    }

    function verify(bytes calldata, bytes32[] calldata publicInputs) external view override returns (bool) {
        if (!configured) {
            return true;
        }
        if (publicInputs.length != expectedLength) {
            return false;
        }
        return publicInputs[0] == expectedFirst;
    }
}
