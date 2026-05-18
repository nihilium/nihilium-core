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

export class ValueInjectionModule extends UnsealConditionModule {
    
    
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("ValueInjectionModule", 
            "Value Injection", proofLibrary);
            this.description = `
                This module is used to inject a value into the proofs to be used accross forks.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            // choice: {
            //     type_order: ["Boolean"],
            //     user_input: false,
            //     description: "The choice, true/false",
            //     required: true
            // },
            value: {
                type_order: ["String", "Number", "Boolean", "Randomness"],
                user_input: true,
                description: "The value to inject",
                required: true
            },
        }
        
        
        
        var value_injection_proof = proofLibrary.getProof("ValueInjection");
        
        var value_injection_proof_id = this.addProof(value_injection_proof);
        
        // this.addSignalEdge(undefined, value_injection_proof_id, ["choice", "choice"], ModuleEdgeInput.);      
    
        this.outputs = {
           value: {
            type_order: ["String", "Number", "Boolean", "Randomness"],
            name: "value",
            description: "The value to inject.",
            proof_key: value_injection_proof_id,
            signal_key: "value",
           }
        }
    }
  

    async produce_proofs(choice: boolean): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        var return_public_inputs = [[toPaddedHex(choice ? 1n : 0n)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}