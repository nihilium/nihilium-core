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

export class ZKEmailModule extends UnsealConditionModule {
    
    protected do_not_fork: boolean = true;
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("ZKEmailModule", 
            "ZK Email Module", proofLibrary);
            this.description = `
                This module is used to validate a ZK Email.
                This module validates an email address and the content of the email header.
                
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            // dkim_key_hash: {
            //     type_order: ["String"],
            //     user_input: false,
            //     description: "The hash of the public key",
            //     required: false
            // },
            email_address_hash: {
                type_order: ["String"],
                user_input: true,
                description: "The hash of the email address",
                required: true
            },
            //Merkle proof of all zkpassport signals
            subject_value: {
                type_order: ["String"],
                user_input: false,
                description: "The value of the subject",
                required: true
            },
        }
        
        
        
        var zk_email_proof = proofLibrary.getProof("zk_email_proof");
        
        var zk_email_proof_id = this.addProof(zk_email_proof);
        this.addSignalEdge(undefined, zk_email_proof_id, ["email_address_hash", "from_address_hash"], ModuleEdgeInput.user_input);      
        this.addSignalEdge(undefined, zk_email_proof_id, ["subject_value", "subject_value"], ModuleEdgeInput.external_input);      
    
        this.outputs = {
            dkim_key_hash: {
                name: "dkim_key_hash",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "dkim_key_hash",
                description: "The hash of the DKIM key",
            },
            subject_value: {
                name: "subject_value",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "subject_value",
                description: "The value of the subject",
            },
            from_address_hash: {
                name: "from_address_hash",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "from_address_hash",
                description: "The hash of the from adhdress",
            },
        }
    }
  

    async produce_proofs(proof_hex: string, public_inputs: any[]): Promise<ModuleProof> {
        var return_proofs = [proof_hex];
        var return_public_inputs = [public_inputs];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: this.obtain_outputs(return_public_inputs)}

    }

    

    
}