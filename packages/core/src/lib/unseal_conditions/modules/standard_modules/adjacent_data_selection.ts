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




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class AdjacentDataSelectionModule extends UnsealConditionModule {
    
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("AdjacentDataSelectionModule", 
            "Adjacent Data Selection", proofLibrary);
            this.description = `
                A module that selects the adjacent data of a given data stream.
                An index from the reveal value is used as starting point.
                This module enforces publication of data beyond the reveal value.
            `;
        this.inputs = {
            
            merkle_root: {
                type_order: ["String"],
                user_input: false,
                description: "Root of the sub tree merkle tree, should come from the opening proof",
                required: true
            },
            previous_index: {
                type_order: ["Number"],
                user_input: false,
                description: "The index of the reveal value in the sub tree merkle tree",
                required: true
            },
            
            
        }
        
        
        var addition_proof = proofLibrary.getProof("AdditionProof");
        var addition_proof_id = this.addProof(addition_proof);
        this.addSignalEdge(undefined, addition_proof_id, ["previous_index", "value1"], ModuleEdgeInput.user_input);
        this.addSignalEdge(undefined, addition_proof_id, ["1", "value2"], ModuleEdgeInput.static_input);
       
        
        var sub_tree_proof = proofLibrary.getProof("MerkleTreeProof");
        var sub_tree_proof_id = this.addProof(sub_tree_proof);
        this.addSignalEdge(addition_proof_id, sub_tree_proof_id, ["result", "index"], ModuleEdgeInput.signal_pass);

        this.addSignalEdge(undefined, sub_tree_proof_id, ["merkle_root", "merkle_root"], ModuleEdgeInput.user_input);
        this.outputs = {
            value: {
                type_order: ["String"],
                name: "sub_tree_value",
                description: "The value of the leaf of the tree",
                proof_key: sub_tree_proof_id,
                signal_key: "leaf_value",
            },
            
            merkle_root: {
                type_order: ["String"],
                name: "merkle_root",
                description: "The merkle root of the tree",
                proof_key: sub_tree_proof_id,
                signal_key: "merkle_root",
            },
            index: {
                type_order: ["Number"],
                name: "index",
                description: "The index of the leaf of the tree",
                proof_key: sub_tree_proof_id,
                signal_key: "index",
            },
        }
    }
  
    //TODO actually do this
    async produce_proofs(timestamp: bigint, threshold: bigint): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        if(timestamp >= threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        var return_public_inputs = [[toPaddedHex(timestamp), toPaddedHex(threshold)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}