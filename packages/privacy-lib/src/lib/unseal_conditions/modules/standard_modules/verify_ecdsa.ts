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

export class VerifyECDSAModule extends UnsealConditionModule {
    
    
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("VerifyECDSAModule", 
            "Verify ECDSA Module", proofLibrary);
            this.description = `
                This module is used to validate a ECDSA signature.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            
            signer_address: {
                type_order: ["String"],
                user_input: false,
                description: "The address of the signer",
                required: true
            },
            message_hash: {
                type_order: ["String"],
                user_input: false,
                description: "The message hash being signed",
                required: true
            },
        }
        
        
        
        var verify_ecdsa_proof = proofLibrary.getProof("VerifyECDSAProof");
        
        var verify_ecdsa_proof_id = this.addProof(verify_ecdsa_proof);
        this.addSignalEdge(undefined, verify_ecdsa_proof_id, ["signer_address", "signer_address"], ModuleEdgeInput.external_input);      
        this.addSignalEdge(undefined, verify_ecdsa_proof_id, ["message_hash", "message_hash"], ModuleEdgeInput.external_input);      
    
        this.outputs = {
            signer_address: {
                type_order: ["String"],
                name: "signer_address",
                description: "The address of the signer",
                proof_key: verify_ecdsa_proof_id,
                signal_key: "signer_address",
            },
            message_hash: {
                type_order: ["String"],
                name: "message_hash",
                description: "The message hash being signed",
                proof_key: verify_ecdsa_proof_id,
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