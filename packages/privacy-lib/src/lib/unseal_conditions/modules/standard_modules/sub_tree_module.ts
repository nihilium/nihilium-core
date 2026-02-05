import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../../ChainedProof";
import { TopLevelTreeProof } from "../../proofs/lib/002_top_level_tree_proof";
import { SubTreeProof } from "../../proofs/lib/001_sub_tree_proof";
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

export class SubTreeModule extends UnsealConditionModule {
    
    protected do_not_fork: boolean = true;
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("SubTreeModule", 
            "Sub Tree Module", proofLibrary);
            this.description = `
                A module that validates a merkle proof of a balanced merkle tree. 
                This proof is non-zk, it doesn't hide the path.
            `;
        this.inputs = {
            
            merkle_root: {
                type_order: ["String"],
                user_input: true,
                description: "Root of the merkle tree",
                required: true
            },
            
        }
        
        
        
        var sub_tree_proof = proofLibrary.getProof("SubTreeMerkleProof");
        var sub_tree_proof_id = this.addProof(sub_tree_proof);

        this.addSignalEdge(undefined, sub_tree_proof_id, ["merkle_root", "merkle_root"], ModuleEdgeInput.user_input);
        this.outputs = {
            sub_tree_value: {
                type_order: ["String"],
                name: "sub_tree_value",
                description: "The value of the leaf of the tree",
                proof_key: sub_tree_proof_id,
                signal_key: "leaf_value",
            },
            sub_tree_index: {
                type_order: ["Number"],
                name: "sub_tree_index",
                description: "The index of the leaf of the tree",
                proof_key: sub_tree_proof_id,
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