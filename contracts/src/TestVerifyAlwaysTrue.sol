// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ChainedProof} from "./ChainedProof.sol";
import {IVerifier} from "./Interfaces.sol";

contract TestVerifyAlwaysTrue is IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external pure returns (bool) {
        return true;
    }
}