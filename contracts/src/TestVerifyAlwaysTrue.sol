// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import {IVerifier} from "./IVerifier.sol";

contract TestVerifyAlwaysTrue is IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external pure returns (bool) {
        return true;
    }
}