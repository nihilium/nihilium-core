// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {EmpheralMerkleTreeKeccak} from "./EmpheralMerkleTreeKeccak.sol";
import {IVerifier, IDataStream} from "./Interfaces.sol";

interface HashFunctionV2 {
    function hash(bytes32[] calldata inputs) external view returns (bytes32);
}


// V2: outputs is a flat bytes32[] instead of bytes32[][]
struct ProvingStateV2 {
    bytes32 current_hash;
    
    uint256 current_index;
    bytes32[] outputs;
    bytes32[] prepared_public_inputs;
    bytes prepared_proof;
    bool verifier_must_be_true;
    address proof_verifier;
    address initiator;
}

contract ChainedProofV2 {
    
    string public constant ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
    string public constant ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";
    
    string public constant ACTION_STATIC_INPUT = "static_input";
    string public constant ACTION_PASS_SIGNAL = "pass_signal";   
    
    string public constant ACTION_VALIDATE_DATA_ROOT = "validate_data_root";

    mapping(bytes32 => ProvingStateV2) public provingStates;
    IVerifier public public_proof_verifier;
    IVerifier public forced_opening_verifier;

    constructor(address _public_proof_verifier, address _forced_opening_verifier) {
        public_proof_verifier = IVerifier(_public_proof_verifier);
        forced_opening_verifier = IVerifier(_forced_opening_verifier);
    }


    function has_data_stream_root(address _datastream, bytes32 _root) public view returns (bool) {
        return IDataStream(_datastream).isKnownValueRoot(_root);
    }

// Before doing actions we need to prepare the proof.
// After preparing we can set static values and pass earlier outputs to the next proof.
// We then call chain_proof_verify
    function dryrun_prepare_next_proof(ProvingStateV2 calldata state, address _verifier, bool _verifierMustBeTrue, bytes32[] calldata _publicInputs, bytes calldata _proof) public pure returns (bytes32) {
        ProvingStateV2 memory new_state = state;
        // This would be the first call with empty state
        if(state.current_hash == bytes32(0)) {
            new_state.current_hash = keccak256(abi.encodePacked(_verifier));
        }
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, _verifier, _verifierMustBeTrue));
        new_state.prepared_public_inputs = _publicInputs;
        new_state.prepared_proof = _proof;
        new_state.proof_verifier = _verifier;
        new_state.verifier_must_be_true = _verifierMustBeTrue;
        return _hashState(new_state);
    }

// V2: validate_data_root uses a flat output_signal_index (no output_proof_index)
    function dryrun_validate_data_root(ProvingStateV2 calldata state, 
        address datastream,         
        uint256 output_signal_index) external view returns (bytes32) {
            ProvingStateV2 memory new_state = state;
            assert(new_state.proof_verifier != address(0));
            new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_VALIDATE_DATA_ROOT, datastream, output_signal_index));
            
            assert(IDataStream(datastream).isKnownValueRoot(new_state.outputs[output_signal_index]));
                
            return _hashState(new_state);
        }

  

// Pass static input variables to the next proof.
// This is used to pass variables like time windows or merkle roots for valid public keys
    function dryrun_chain_static_input(ProvingStateV2 calldata state, bytes32 value, uint256 public_input_index) external pure returns (bytes32) {
        ProvingStateV2 memory new_state = state;
        assert(new_state.prepared_proof.length > 0);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_STATIC_INPUT));
        new_state.prepared_public_inputs[public_input_index] = value;
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, public_input_index, value));
        return _hashState(new_state);
    }


// V2: pass_signal uses flat output indices (no output_proof_index).
// output_indexes[0] is the flat start index, output_indexes[1] is the count.
    function dryrun_chain_pass_signal(ProvingStateV2 calldata state, 
        uint256[2] calldata public_input_indexes, 
        uint256[2] calldata output_indexes) external pure returns (bytes32) {
        ProvingStateV2 memory new_state = state;
        assert(public_input_indexes[1] == output_indexes[1]);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_PASS_SIGNAL));
        for (uint256 i = 0; i < public_input_indexes[1]; i++) {
            new_state.prepared_public_inputs[public_input_indexes[0] + i] = new_state.outputs[output_indexes[0] + i];
            new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, public_input_indexes[0] + i, output_indexes[0] + i));
        }
        return _hashState(new_state);
    }

// V2: After verifying, append outputs to flat list then apply bitmask pruning.
// mask is a uint256 bitmask where bit i corresponds to flat list entry i.
// 1 = keep, 0 = remove.
    function dryrun_chain_proof_verify(ProvingStateV2 calldata state, uint256 mask, bool ignore_proof) external view returns (bytes32) {
        ProvingStateV2 memory new_state = state;
        assert(new_state.prepared_public_inputs.length > 0);
        assert(new_state.proof_verifier != address(0));
        assert(ignore_proof || IVerifier(new_state.proof_verifier).verify(new_state.prepared_proof, new_state.prepared_public_inputs) == new_state.verifier_must_be_true);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, new_state.proof_verifier, mask));

        // Step 1: Build combined array (existing outputs + new proof outputs)
        uint256 oldLen = state.outputs.length;
        uint256 newLen = new_state.prepared_public_inputs.length;
        uint256 combinedLen = oldLen + newLen;

        // Step 2: Count how many entries the mask keeps
        uint256 keptCount = 0;
        for (uint256 i = 0; i < combinedLen; i++) {
            if ((mask & (uint256(1) << i)) != 0) {
                keptCount++;
            }
        }

        // Step 3: Build pruned flat outputs array
        bytes32[] memory pruned = new bytes32[](keptCount);
        uint256 writeIdx = 0;
        for (uint256 i = 0; i < combinedLen; i++) {
            if ((mask & (uint256(1) << i)) != 0) {
                if (i < oldLen) {
                    pruned[writeIdx] = state.outputs[i];
                } else {
                    pruned[writeIdx] = new_state.prepared_public_inputs[i - oldLen];
                }
                writeIdx++;
            }
        }

        new_state.outputs = pruned;
        new_state.prepared_proof = new bytes(0);
        new_state.prepared_public_inputs = new bytes32[](0);
        
        return _hashState(new_state);
    }

// Hash the entire ProvingStateV2 struct using chained keccak256.
// Folds each field sequentially: h = keccak256(h, field)
// For dynamic arrays, each element is folded in individually.
    function _hashState(ProvingStateV2 memory state) internal pure returns (bytes32) {
        bytes32 h = keccak256(abi.encodePacked(bytes32(0), state.current_hash));
        h = keccak256(abi.encodePacked(h, state.current_index));

        // outputs array
        for (uint256 i = 0; i < state.outputs.length; i++) {
            h = keccak256(abi.encodePacked(h, state.outputs[i]));
        }

        // prepared_public_inputs array
        for (uint256 i = 0; i < state.prepared_public_inputs.length; i++) {
            h = keccak256(abi.encodePacked(h, state.prepared_public_inputs[i]));
        }

        // prepared_proof (dynamic bytes)
        h = keccak256(abi.encodePacked(h, state.prepared_proof));

        h = keccak256(abi.encodePacked(h, state.verifier_must_be_true));
        h = keccak256(abi.encodePacked(h, state.proof_verifier));
        h = keccak256(abi.encodePacked(h, state.initiator));

        return h;
    }

    function hashProvingState(ProvingStateV2 calldata state) external pure returns (bytes32) {
        ProvingStateV2 memory s = state;
        return _hashState(s);
    }

}
