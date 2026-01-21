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
            "Time Delay Module", proofLibrary);
            this.description = `
                This module is used to validate that a timestamp is after a certain time delay.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            timestamp_low: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The timestamp to check",
                required: true
            },
            timestamp_high: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The threshold timestamp",
                required: true
            },
            offset: {
                type_order: ["Number"],
                user_input: true,
                description: "The offset",
                required: true
            },
        }
        
        
        
        var time_delay_proof = proofLibrary.getProof("TimeDelayProof");
        
        var time_delay_proof_id = this.addProof(time_delay_proof);
        this.addSignalEdge(undefined, time_delay_proof_id, ["timestamp_low", "timestamp_low"], ModuleEdgeInput.external_input);
        this.addSignalEdge(undefined, time_delay_proof_id, ["timestamp_high", "timestamp_high"], ModuleEdgeInput.external_input);
        this.addSignalEdge(undefined, time_delay_proof_id, ["offset", "offset"], ModuleEdgeInput.user_input);
       
    
        this.outputs = {
           
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