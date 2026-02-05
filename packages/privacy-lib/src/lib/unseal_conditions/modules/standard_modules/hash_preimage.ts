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

export class HashPreimageModule extends UnsealConditionModule {
    
    protected do_not_fork: boolean = true;
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("HashPreimageModule", 
            "Hash Preimage Module", proofLibrary);
            this.description = `
                This module is used to validate a hash preimage.
                It validates that a hash is the result of a keccak hash of a preimage.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            
            preimage: {
                type_order: ["String"],
                user_input: true,
                description: "Preimage to validate",
                required: true
            },
        }
        
        
        
        var keccak_tree_entry_proof = proofLibrary.getProof("KeccakTreeEntry");
        
        var keccak_tree_entry_proof_id = this.addProof(keccak_tree_entry_proof);
        
        this.addSignalEdge(undefined, keccak_tree_entry_proof_id, ["preimage", "plain_value"], ModuleEdgeInput.user_input);      
    
        this.outputs = {
          hash: {
            type_order: ["String"],
            name: "hash",
            description: "The hash",
            proof_key: keccak_tree_entry_proof_id,
            signal_key: "tree_entry",
          }
        }
    }
  

    async produce_proofs(hash: string, preimage: string): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        var return_public_inputs = [[toPaddedHex(BigInt(preimage)),toPaddedHex(BigInt(hash))]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}