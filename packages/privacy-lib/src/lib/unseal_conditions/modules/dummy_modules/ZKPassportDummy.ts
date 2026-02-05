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

export class ZKPassportDummyModule extends UnsealConditionModule {
    
    protected do_not_fork: boolean = true;
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("ZKPassportModule", 
            "ZKPassport Dummy Module", proofLibrary);
            this.description = `
                This module is used to validate a ZKPassport.
                It validates a random value that should appear in the proofs 'custom_data' (zkpassport specific), 
                this value should come from a randomness source.
                It validates a merkle root of all possible values that are allowed to be produced by ZKPassport.

            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            random_value: {
                type_order: ["Randomness"],
                user_input: false,
                description: "Random value that should appear in the proof, should come from a randomness source",
                required: true
            },
            //Merkle proof of all zkpassport signals
            merkle_data_commitment: {
                type_order: ["String"],
                user_input: true,
                description: "This is a merkle root of all possible values that are allowed to be produced by ZKPassport",
                required: true
            },
            timestamp: {
                type_order: ["Timestamp"],
                user_input: false,
                description: "The timestamp used to validate a recent ZKPassport proof",
                required: true
            }
        }
        
        
        
        var manual_choice_proof = proofLibrary.getProof("ManualChoiceProof");
        
        var manual_choice_proof_id = this.addProof(manual_choice_proof);
        //this.addSignalEdge(undefined, manual_choice_proof_id, ["choice", "choice"], ModuleEdgeInput.user_input);      
    
        this.outputs = {
        custom_data: {
            name: "custom_data",
            type_order: ["String"],
            proof_key: manual_choice_proof_id,
            signal_key: "choice",
            description: "The custom data, this is a random value that should appear in the proof, should come from a randomness source",
        },
        }
    }
  

    async produce_proofs(choice: boolean): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        var return_public_inputs = [[toPaddedHex(choice ? 1n : 0n)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}