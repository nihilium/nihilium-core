import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../../ChainedProof";
import { TopLevelTreeProof } from "../../proofs/lib/002_top_level_tree_proof";
import { MerkleTreeProof } from "../../proofs/lib/001_merkle_proof";
import { ProofMode } from "../../proofs/zk_proofs/types";
import { CompiledChainedProofCollection, UnsealProofAction } from "../../types";
import { IDataStream } from "../../../data_stream/types";
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

export class TopLevelTreeModule extends UnsealConditionModule {
    protected do_not_fork: boolean = true;   
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("TopLevelTreeModule", 
            "Anchored Merkle Tree Proof", proofLibrary);
            this.description = `
                This module is used to validate a top level merkle proof.
            `;
        this.inputs = {
            
            top_level_merkle_root: {
                type_order: ["String"],
                user_input: false,
                description: "The computed root",
                required: true
            },
            
        }
        
        
        
        var top_level_tree_proof = proofLibrary.getProof("TopLevelMerkleProof");
        var top_level_tree_proof_id = this.addProof(top_level_tree_proof);

    
        this.addSignalEdge(undefined, top_level_tree_proof_id, ["top_level_merkle_root", "merkle_root"], ModuleEdgeInput.user_input);
        this.outputs = {
            top_level_merkle_root: {
                type_order: ["String"],
                name: "top_level_merkle_root",
                description: "The sub tree value",
                proof_key: top_level_tree_proof_id,
                signal_key: "merkle_root",
            },
            timestamp: {
                type_order: ["Timestamp", "Number"],
                name: "timestamp",
                description: "The timestamp related to the leaf of the tree",
                proof_key: top_level_tree_proof_id,
                signal_key: "block_timestamp",
            },
            subtree_root: {
                type_order: ["String"],
                name: "subtree_root",
                description: "The value used in combination with the timestamp to produce a leaf value for the tree",
                proof_key: top_level_tree_proof_id,
                signal_key: "subtree_root",
            },
            index: {
                type_order: ["Number"],
                name: "leaf_index",
                description: "The index of the leaf of the tree",
                proof_key: top_level_tree_proof_id,
                signal_key: "index",
            }
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