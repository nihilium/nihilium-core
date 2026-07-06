import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../../ChainedProof";
import { TopLevelTreeProof } from "../../proofs/lib/002_top_level_tree_proof";
import { MerkleTreeProof } from "../../proofs/lib/001_merkle_proof";
import { ProofMode } from "../../proofs/zk_proofs/types";
import { CompiledChainedProofCollection, UnsealProofAction } from "../../types";
import { IDualDataStream } from "../../../data_stream/types";
import { ethers, Signer } from "ethers";
import { UnsealOpeningProof } from "../../proofs/lib/000_unseal_opening_proof";
import { KeccakTreeEntryProof } from "../../proofs/lib/003_keccak_tree_entry";
import { ProofPath } from "fixed-merkle-tree";
import { ProcessorEndpoint } from "../../../../types/protocol/common";
import { createMimcMerkelTree, toPaddedHex, keccakTreeHasher } from "../../../utils";
import { hexToBytes } from "@noble/hashes/utils";
import { IOMap, ModuleEdge, ModuleEdgeInput, ModuleNode, ModuleProof, UnsealConditionModule } from "../types";
import { UnsealConditionProof } from "../../proofs/types";
import { ProofLibraryType } from "../../proofs";
import { SmallerThanProof } from "../../proofs/lib/004_smaller_than";
import { GreaterOrEqualThenProof } from "../../proofs/lib/005_greater_or_equal";
import { TimeDelayProof } from "../../proofs/lib/006_time_delay";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

//TODO: Implement this module, still missing proof and datastream handling
export class InclusionProofModule extends UnsealConditionModule {
    
    
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("InclusionProofModule", 
            "Inclusion Proof", proofLibrary);
            this.description = `
                This module is used to prove that a value exists in the dataset.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            
            value: {
                type_order: ["String"],
                user_input: true,
                description: "The value NOT existing in the dataset",
                required: true
            },
            top_level_merkle_root: {
                type_order: ["String"],
                user_input: false,
                description: "The merkle root of the top level tree",
                required: true
            },
            
          
        }
        
        
        var keccack_tree_hash_proof = proofLibrary.getProof("KeccakTreeEntry");
        var keccack_tree_hash_proof_id = this.addProof(keccack_tree_hash_proof);
        var merkle_proof = proofLibrary.getProof("MerkleTreeProof");
        var merkle_proof_id = this.addProof(merkle_proof);
        var top_level_tree_proof = proofLibrary.getProof("TopLevelMerkleProof");
        var top_level_tree_proof_id = this.addProof(top_level_tree_proof);
        

        this.addSignalEdge(undefined, keccack_tree_hash_proof_id, ["value", "plain_value"], ModuleEdgeInput.user_input);
        this.addSignalEdge(keccack_tree_hash_proof_id, merkle_proof_id, ["tree_entry", "leaf_value"], ModuleEdgeInput.signal_pass);
        this.addSignalEdge(merkle_proof_id, top_level_tree_proof_id, ["merkle_root", "subtree_root"], ModuleEdgeInput.signal_pass);

        //this.addSignalEdge(undefined, merkle_proof_id, ["signer_address", "signer_address"], ModuleEdgeInput.external_input);      
        //this.addSignalEdge(undefined, merkle_proof_id, ["message_hash", "message_hash"], ModuleEdgeInput.external_input);      
        this.dataStreamOutputFields = ["top_level_merkle_root"];
        
        this.outputs = {
            
            value: {
                type_order: ["String"],
                name: "value",
                description: "The value that does not exist in the dataset, or if false does not exist in the dataset",
                proof_key: keccack_tree_hash_proof_id,
                signal_key: "value",
            },
            top_level_merkle_root: {
                type_order: ["String"],
                name: "merkle_root",
                description: "The merkle root of the dataset",
                proof_key: top_level_tree_proof_id,
                signal_key: "message_hash",
            }
        }
    }
  

    async produce_proofs(choice: boolean): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        var return_public_inputs = [[toPaddedHex(choice ? 1n : 0n)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}