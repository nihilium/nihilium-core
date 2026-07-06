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

export class AfterTimeModule extends UnsealConditionModule {
    
   
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("AfterTimeModule", 
            "After Time Check", proofLibrary);
            this.description = `
                This module is used to validate that a timestamp is after a certain time.
                Calculation is: timestamp > threshold
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            timestamp: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The timestamp to check in seconds",
                required: true
            },
            threshold: {
                type_order: ["Timestamp", "Number"],
                user_input: true,
                description: "The threshold timestamp in seconds",
                required: true
            },
        }
        
        
        
        var smaller_than_proof = proofLibrary.getProof("SmallerThan");
        var smaller_than_proof_id = this.addProof(smaller_than_proof);
        this.forkingProof = smaller_than_proof_id;
        this.addSignalEdge(undefined, smaller_than_proof_id, ["timestamp", "timestamp"], ModuleEdgeInput.external_input);
        this.addSignalEdge(undefined, smaller_than_proof_id, ["threshold", "threshold"], ModuleEdgeInput.user_input);
        
    
        this.outputs = {
            
            timestamp: {
                name: "timestamp",
                type_order: ["Timestamp", "Number"],
                proof_key: smaller_than_proof_id,
                signal_key: "timestamp",
                description: "The timestamp to check in seconds",
            },
            threshold: {
                name: "threshold",
                type_order: ["Timestamp", "Number"],
                proof_key: smaller_than_proof_id,
                signal_key: "threshold",
                description: "The threshold timestamp in seconds",
            },
           
        }
    }
  

    async produce_proofs(timestamp: bigint, threshold: bigint): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        if(timestamp >= threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        var return_public_inputs = [[toPaddedHex(timestamp), toPaddedHex(threshold)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}