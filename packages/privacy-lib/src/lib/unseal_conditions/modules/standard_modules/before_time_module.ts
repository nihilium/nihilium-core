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
import { IOMap, ModuleEdge, ModuleEdgeInput, ModuleNode, UnsealConditionModule } from "../types";
import { UnsealConditionProof } from "../../proofs/types";
import { ProofLibraryType } from "../../proofs";
import { SmallerThanProof } from "../../proofs/lib/004_smaller_than";
import { GreaterOrEqualThenProof } from "../../proofs/lib/005_greater_or_equal";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class BeforeTimeModule extends UnsealConditionModule {
    
   
    
    
    private greater_or_equal_then_proof:GreaterOrEqualThenProof;

    private greater_or_equal_then_proof_node: ModuleNode;
    // private inputs: IOMap;
    // private outputs: IOMap;
    
    // protected unseal_proofs: UnsealConditionProof[] = [

    // ];
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("BeforeTimeModule", 
            "Before Time Module", proofLibrary);
            this.description = `
                This module is used to validate that a timestamp is before a certain time.
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
                description: "The timestamp to check",
                required: true
            },
            threshold: {
                type_order: ["Timestamp", "Number"],
                user_input: true,
                description: "The threshold timestamp",
                required: true
            },
        }
        
        
        
        this.greater_or_equal_then_proof = new proofLibrary.standard["GreaterOrEqualThenProof"]() as GreaterOrEqualThenProof;

        this.greater_or_equal_then_proof_node = new ModuleNode(this.greater_or_equal_then_proof.getName(), this.greater_or_equal_then_proof, [this.inputs["timestamp"], this.inputs["threshold"]]);
        this.startingNode = this.greater_or_equal_then_proof_node;
        //Required by super class for compilation
        this.nodes[this.greater_or_equal_then_proof_node.node_id] = this.greater_or_equal_then_proof_node;
        
        
        //Represents a static input from the user
        var timestamp_edge =  new ModuleEdge( 
            undefined,
            this.greater_or_equal_then_proof_node, 
            ["timestamp", "timestamp"], 
            ModuleEdgeInput.external_input);
        var threshold_edge =  new ModuleEdge( 
            undefined,
            this.greater_or_equal_then_proof_node, 
            ["threshold", "threshold"], 
            ModuleEdgeInput.user_input);

     
        
            //Required by super class for compilation
        this.edges[timestamp_edge.edge_id] = timestamp_edge;
        // this.edges[link_edge.edge_id] = link_edge;
        this.edges[threshold_edge.edge_id] = threshold_edge;
    
        this.outputs = {
           
        }
    }
  

    async produce_proofs(timestamp: bigint, threshold: bigint): Promise<{proofs: any[], public_inputs: any[][]}> {
        var return_proofs = ["0x"];
        if(timestamp >= threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        var return_public_inputs = [[toPaddedHex(timestamp), toPaddedHex(threshold)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs}

    }

    

    
}