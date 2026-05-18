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
import { GreaterOrEqualThenProof } from "../../proofs/lib/005_greater_or_equal";
import { TimeDelayProof } from "../../proofs/lib/006_time_delay";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class TimeDelayModule extends UnsealConditionModule {
    
    
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("TimeDelayModule", 
            "Time Delay Check", proofLibrary);
            this.description = `
                This module is used to validate that a timestamp is after a certain time delay.
                The calculation is: timestamp_high - timestamp_low > offset
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
           
            top_level_merkle_root: {
                type_order: ["String"],
                user_input: false,
                description: "The merkle root used to validate the delay, should come from the opening proof",
                required: true
            },
            timestamp: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The timestamp to check in seconds, should come from the opening proof",
                required: true
            },
            delay: {
                type_order: ["Number"],
                user_input: true,
                description: "The delay in seconds",
                required: true
            },
        }
        
        
        var top_level_tree_proof = proofLibrary.getProof("TopLevelMerkleProof");
        var top_level_tree_proof_id = this.addProof(top_level_tree_proof);

        this.addSignalEdge(undefined, top_level_tree_proof_id, ["top_level_merkle_root", "merkle_root"], ModuleEdgeInput.external_input);
        //this.addSignalEdge(undefined, top_level_tree_proof_id, ["offset", "offset"], ModuleEdgeInput.user_input);
        
        var time_delay_proof = proofLibrary.getProof("TimeDelayProof");
        
        var time_delay_proof_id = this.addProof(time_delay_proof);
        this.forkingProof = time_delay_proof_id;
        this.addSignalEdge(undefined, time_delay_proof_id, ["timestamp", "timestamp_low"], ModuleEdgeInput.external_input);
        this.addSignalEdge(top_level_tree_proof_id, time_delay_proof_id, ["block_timestamp", "timestamp_high"], ModuleEdgeInput.signal_pass);
        this.addSignalEdge(undefined, time_delay_proof_id, ["delay", "offset"], ModuleEdgeInput.user_input);
       
    
        this.outputs = {
            timestamp_high: {
                name: "timestamp_high",
                type_order: ["Timestamp", "Number"],
                proof_key: time_delay_proof_id,
                signal_key: "timestamp_high",
                description: "The timestamp of the block that was used as high value for the delay",
            },
            delay: {
                name: "delay",
                type_order: ["Number"],
                proof_key: time_delay_proof_id,
                signal_key: "offset",
                description: "The delay in seconds",
            },
          
           
        }
    }
  
    //TODO implement this, requires a datastream to request a merkle proof from a late 
    async produce_proofs(timestamp: bigint, threshold: bigint): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        if(timestamp >= threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        var return_public_inputs = [[toPaddedHex(timestamp), toPaddedHex(threshold)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}