// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {Poseidon2Lib} from "poseidon2-evm/src/Poseidon2Lib.sol";
import {Field} from "poseidon2-evm/src/Field.sol";

import "./IVerifier.sol";

/**
 * @title Poseidon2
 * @notice A contract that implements the Poseidon2 hash function
 */
contract Poseidon2Verifier is IVerifier {
    constructor() {
    }

/**
 * 
 * @param proof is empty
 * @param publicSignals See dev notes
 * @dev publicSignals[0] is the first input
 * @dev publicSignals[1] is the second input, optional
 * @dev publicSignals[2] is the third input, optional
 * @dev publicSignals[3] is the expected hash
 
 */
    function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
        assert(publicSignals.length == 4);
        assert(proof.length == 0);

        Field.Type result;
        Field.Type input0 = Field.toField(publicSignals[0]);
        
        // Check if inputs 1 and 2 are empty (zero)
        bool input1Empty = publicSignals[1] == bytes32(0);
        bool input2Empty = publicSignals[2] == bytes32(0);
        
        if (input1Empty && input2Empty) {
            // Only first input provided
            result = Poseidon2Lib.hash_1(input0);
        } else if (!input1Empty && input2Empty) {
            // First and second inputs provided
            Field.Type input1 = Field.toField(publicSignals[1]);
            result = Poseidon2Lib.hash_2(input0, input1);
        } else if (!input1Empty && !input2Empty) {
            // All three inputs provided
            Field.Type input1 = Field.toField(publicSignals[1]);
            Field.Type input2 = Field.toField(publicSignals[2]);
            result = Poseidon2Lib.hash_3(input0, input1, input2);
        } else {
            // Invalid: input2 provided but input1 is empty
            return false;
        }
        
        return Field.toBytes32(result) == publicSignals[3];
    }
}