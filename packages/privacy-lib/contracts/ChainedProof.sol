// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {EmpheralMerkleTreeKeccak} from "./EmpheralMerkleTreeKeccak.sol";
import {IVerifier, IDataStream} from "./Interfaces.sol";

interface HashFunction {
    function hash(bytes32[] calldata inputs) external view returns (bytes32);
}





struct ProvingState {
    bytes32 current_hash;
    //bytes32 expected_hash;
    uint256 current_index;
    bytes32[][] outputs;
    bytes32[] prepared_public_inputs;
    bytes prepared_proof;
    bool verifier_must_be_true;
    address proof_verifier;
    // uint256[] commited_processor_public_key;
    address initiator;
}
contract ChainedProof {
    
    string public constant ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
    string public constant ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";
    
    string public constant ACTION_STATIC_INPUT = "static_input";
    string public constant ACTION_PASS_SIGNAL = "pass_signal";   
    
    string public constant ACTION_VALIDATE_DATA_ROOT = "validate_data_root";

    mapping(bytes32 => ProvingState) public provingStates;
    IVerifier public public_proof_verifier;
    IVerifier public forced_opening_verifier;

    constructor(address _public_proof_verifier, address _forced_opening_verifier) {
        public_proof_verifier = IVerifier(_public_proof_verifier);
        forced_opening_verifier = IVerifier(_forced_opening_verifier);
    }


    function has_data_stream_root(address _datastream, bytes32 _root) public view returns (bool) {
        // ProvingState memory new_state = state;
        // new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_VALIDATE_DATA_ROOT));
        // assert();        
        return IDataStream(_datastream).isKnownValueRoot(_root);
    }
//Before doing actions and we need to prepare the proof.
//After preparing we can set static values and pass earlier outputs to the next proof.
//We then call chain_proof_verify
    function dryrun_prepare_next_proof(ProvingState calldata state, address _verifier, bool _verifierMustBeTrue, bytes32[] calldata _publicInputs, bytes calldata _proof) public pure returns (ProvingState memory) {
        ProvingState memory new_state = state;
        //This would be the first call with empty state
        if(state.current_hash == bytes32(0)) {
            new_state.current_hash = keccak256(abi.encodePacked(_verifier));
        }
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, _verifier, _verifierMustBeTrue));
        new_state.prepared_public_inputs = _publicInputs;
        new_state.prepared_proof = _proof;
        new_state.proof_verifier = _verifier;
        new_state.verifier_must_be_true = _verifierMustBeTrue;
        return new_state;
    }

    function dryrun_validate_data_root(ProvingState calldata state, 
        address datastream,         
        uint256 public_input_index,
        bool is_delayed_proof,
        bytes calldata optional_dual_tree_proof,
        bytes32[] calldata optional_dual_tree_public_inputs,
        uint256 merkle_root_index) external view returns (ProvingState memory) {
            ProvingState memory new_state = state;
            assert(new_state.prepared_proof.length > 0);
            assert(new_state.prepared_public_inputs.length > 0);
            assert(new_state.proof_verifier != address(0));
            new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_VALIDATE_DATA_ROOT, public_input_index));
            
            if (is_delayed_proof) {
                assert(IDataStream(datastream).isKnownMerkleRoot(optional_dual_tree_public_inputs[merkle_root_index]));
                assert(IVerifier(forced_opening_verifier).verify(optional_dual_tree_proof, optional_dual_tree_public_inputs));
            } else {
                assert(IDataStream(datastream).isKnownValueRoot(new_state.prepared_public_inputs[public_input_index]));
                
            }
            return new_state;
        }

  

//Pass static input variables to the next proof.
//This is used to pass variables like time windows or merkle roots for valid public keys
    function dryrun_chain_static_input(ProvingState calldata state, bytes32 value, uint256 public_input_index) external pure returns (ProvingState memory) {
        ProvingState memory new_state = state;
        //assert(indexes.length == inputs.length);
        assert(new_state.prepared_proof.length > 0);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_STATIC_INPUT));
       // for (uint256 i = 0; i < indexes.length; i++) {
        new_state.prepared_public_inputs[public_input_index] = value;
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, public_input_index, value));
       // }        
        return new_state;
    }


//Pass signal is used to pass a signal from one proof to the next.
//This is used to make sure certain proofs reference the same state in the datastream.
//Or even the same datastream itself
    function dryrun_chain_pass_signal(ProvingState calldata state, 
        uint256[] calldata public_input_indexes, 
        uint256 output_proof_index, 
        uint256[] calldata output_indexes) external pure returns (ProvingState memory) {
        ProvingState memory new_state = state;
        assert(public_input_indexes.length == output_indexes.length);
        assert(new_state.prepared_proof.length > 0);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, ACTION_PASS_SIGNAL));
        for (uint256 i = 0; i < public_input_indexes.length; i++) {
            new_state.prepared_public_inputs[public_input_indexes[i]] = new_state.outputs[output_proof_index][output_indexes[i]];
            new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, public_input_indexes[i], output_proof_index,output_indexes[i]));
        }
        return new_state;
    }
// After preparing and doing 'ACTIONS' we verify the proof
    function dryrun_chain_proof_verify(ProvingState calldata state, bool ingore_proof) external view returns (ProvingState memory) {
        ProvingState memory new_state = state;
        assert(new_state.prepared_proof.length > 0);
        assert(new_state.prepared_public_inputs.length > 0);
        assert(new_state.proof_verifier != address(0));
        assert(ingore_proof || IVerifier(new_state.proof_verifier).verify(new_state.prepared_proof, new_state.prepared_public_inputs) == new_state.verifier_must_be_true);
        new_state.current_hash = keccak256(abi.encodePacked(new_state.current_hash, new_state.proof_verifier));

        new_state.outputs = new bytes32[][](new_state.outputs.length + 1);
        for (uint256 i = 0; i < new_state.outputs.length - 1; i++) {
            new_state.outputs[i] = state.outputs[i];
        }
        new_state.outputs[new_state.outputs.length - 1] = new_state.prepared_public_inputs;
        new_state.prepared_proof = new bytes(0);
        new_state.prepared_public_inputs = new bytes32[](0);
        
        return new_state;
    }


  


}