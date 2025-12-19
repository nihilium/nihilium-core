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




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class DefaultAnchoredOpeningProofModule extends UnsealConditionModule {
    
   
    
    private opening_proof:UnsealOpeningProof;
    private top_level_merkle_tree_proof:TopLevelTreeProof;
    private sub_tree_merkle_tree_proof:SubTreeProof;
    private keccack_tree_hash_proof:KeccakTreeEntryProof;

    private opening_proof_node: ModuleNode;
    private top_level_merkle_tree_proof_node: ModuleNode;
    private sub_tree_merkle_tree_proof_node: ModuleNode;
    private keccack_tree_hash_proof_node: ModuleNode;
    // private inputs: IOMap;
    // private outputs: IOMap;
    
    // protected unseal_proofs: UnsealConditionProof[] = [

    // ];
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("DefaultAnchoredOpeningModule", 
            "Default Anchored Opening Module", proofLibrary);
            this.description = `
                This module is the starting module for all further unseal conditions.
                It validates the opening proof and sets the metadata, timestamp and merkle roots.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            metadata_root_hash: {
                type_order: ["String"],
                user_input: true,
                description: "The metadata root hash",
                required: true
            },
        }
        
        
        
        this.opening_proof = new proofLibrary.standard["UnsealOpeningProof"]() as UnsealOpeningProof;
        this.top_level_merkle_tree_proof = new proofLibrary.standard["TopLevelTreeProof"]() as TopLevelTreeProof;
        this.sub_tree_merkle_tree_proof = new proofLibrary.standard["SubTreeProof"]() as SubTreeProof;
        this.keccack_tree_hash_proof = new proofLibrary.standard["KeccakTreeEntryProof"]() as KeccakTreeEntryProof;

        this.opening_proof_node = new ModuleNode("opening_proof", this.opening_proof, [this.inputs["metadata_root_hash"]]);
        this.top_level_merkle_tree_proof_node = new ModuleNode("top_level_merkle_tree_proof", this.top_level_merkle_tree_proof, []);
        this.sub_tree_merkle_tree_proof_node = new ModuleNode("sub_tree_merkle_tree_proof", this.sub_tree_merkle_tree_proof, []);
        this.keccack_tree_hash_proof_node = new ModuleNode("keccack_tree_hash_proof", this.keccack_tree_hash_proof, []);
        this.startingNode = this.opening_proof_node;
        //Required by super class for compilation
        this.nodes[this.opening_proof_node.node_id] = this.opening_proof_node;
        this.nodes[this.keccack_tree_hash_proof_node.node_id] = this.keccack_tree_hash_proof_node;
        this.nodes[this.top_level_merkle_tree_proof_node.node_id] = this.top_level_merkle_tree_proof_node;
        this.nodes[this.sub_tree_merkle_tree_proof_node.node_id] = this.sub_tree_merkle_tree_proof_node;
        
        
        //Represents a static input from the user
        var opening_edge =  new ModuleEdge( 
            undefined,
            this.opening_proof_node, 
            ["metadata_root_hash", "metadata_root_hash"], 
            ModuleEdgeInput.user_input);

     
        var keccack_tree_hash_edge =  new ModuleEdge( 
            this.opening_proof_node,
            this.keccack_tree_hash_proof_node, 
            ["reveal_value", "reveal_value"], ModuleEdgeInput.signal_pass);
        
        var sub_tree_entry_edge =  new ModuleEdge( 
            this.keccack_tree_hash_proof_node,
            this.sub_tree_merkle_tree_proof_node, 
            ["tree_entry", "leaf_value"], ModuleEdgeInput.signal_pass);
              

        var top_level_edge =  new ModuleEdge( 
            this.sub_tree_merkle_tree_proof_node,
            this.top_level_merkle_tree_proof_node, 
            ["computed_root", "subtree_root"], ModuleEdgeInput.signal_pass);
        
        
            //Required by super class for compilation
        this.edges[opening_edge.edge_id] = opening_edge;
        // this.edges[link_edge.edge_id] = link_edge;
        this.edges[keccack_tree_hash_edge.edge_id] = keccack_tree_hash_edge;
        this.edges[sub_tree_entry_edge.edge_id] = sub_tree_entry_edge;
        //this.edges[sub_tree_edge.edge_id] = sub_tree_edge;
        this.edges[top_level_edge.edge_id] = top_level_edge;
    
        this.outputs = {
            link: {
                name: "link",
                type_order: ["Other"],                
                description: "A simple link to define ordering",
                proof_key: this.opening_proof_node.node_id,
                signal_key: "link",
                
            },
            reveal_value: {
                name: "reveal_value",
                type_order: ["String"],
                proof_key: this.opening_proof_node.node_id,
                signal_key: "reveal_value",
                description: "The reveal value",
                
            },
            reveal_value_tree_hash: {
                name: "reveal_value_tree_hash",
                type_order: ["String"],
                proof_key: this.keccack_tree_hash_proof_node.node_id,
                signal_key: "tree_entry",
                description: "The reveal value tree hash",
                
            },
            sub_tree_merkle_root: {
                name: "sub_tree_merkle_root",
                type_order: ["String"], //Not randomness as influencable by datastream
                proof_key: this.sub_tree_merkle_tree_proof_node.node_id,
                signal_key: "computed_root",
                description: "The sub tree merkle root",
                
            },
            top_level_merkle_root: {
                name: "top_level_merkle_root",
                type_order: ["String", "Randomness"], //This root is defined by a mined block
                proof_key: this.top_level_merkle_tree_proof_node.node_id,
                signal_key: "computed_root",
                description: "The top level merkle root",
                
            },
            metadata_root_hash: {
                name: "metadata_root_hash",
                type_order: ["String"],
                proof_key: this.opening_proof_node.node_id,
                signal_key: "metadata_root_hash", //TODO not actually there
                description: "The metadata root hash",
                
            },
            timestamp: {
                name: "timestamp",
                type_order: ["Timestamp", "Number"],
                proof_key: this.top_level_merkle_tree_proof_node.node_id,
                signal_key: "block_timestamp",
                description: "The timestamp",
                
            }
        }
    }
    // getConstructorFields(): {[key:string]:any} {
    //     return {
    //         opening_proof_address: this.opening_proof_address,
    //         top_level_merkle_tree_address: this.top_level_merkle_tree_address,
    //         sub_tree_merkle_tree_address: this.sub_tree_merkle_tree_address,
    //     }
    // }
    // override getCollectionId(): string {
    //     return "reveal_only_normal_trees";
    // }


    /**
     * Regardless of the ordering, this function is itself responsible for producing
     * proofs in the correct order
     * @param dataStream 
     * @param processor 
     * @param opening_proof 
     * @param opening_public_inputs 
     * @returns 
     */
    async produce_proofs(dataStream: IDataStream, processor:ProcessorEndpoint, opening_proof:any, opening_public_inputs: any[]): Promise<{proofs: any[], public_inputs: any[][]}> {
        var return_proofs = [opening_proof];
        var return_public_inputs = [opening_public_inputs];
        var reveal_value = opening_public_inputs[this.opening_proof.getProofInputSignalIndex("reveal_value")[0]];
        var data_stream_merkle_proof:[ProofPath, ProofPath, number, number, number] = await dataStream.getProof(reveal_value); //global, subtree
        
        var reveal_value_hash = keccakTreeHasher(reveal_value, 0n)
     

        return_proofs.push("0x");
        return_public_inputs.push([
            toPaddedHex(BigInt(reveal_value)), 
            toPaddedHex(BigInt(reveal_value_hash)),
        ])
        return_proofs.push(hexToBytes(data_stream_merkle_proof[1].pathElements.map(element => toPaddedHex(BigInt(element.toString())).slice(2)).join("")))
        return_public_inputs.push([
             toPaddedHex(BigInt(data_stream_merkle_proof[1].pathRoot.toString())), 
             toPaddedHex(BigInt(reveal_value_hash)), 
             toPaddedHex(BigInt(data_stream_merkle_proof[4]))
        ])
        
        
        return_proofs.push(hexToBytes(data_stream_merkle_proof[0].pathElements.map(element => toPaddedHex(BigInt(element.toString())).slice(2)).join("")))
        //TODO DO THIS=========set the public inputs
        //return_public_inputs.push(top_level_merkle_proof.publicSignals)
        return_public_inputs.push([
            toPaddedHex(BigInt(data_stream_merkle_proof[0].pathRoot.toString())),
            toPaddedHex(BigInt(data_stream_merkle_proof[2])), 
            toPaddedHex(BigInt(data_stream_merkle_proof[0].pathRoot.toString())), 
            toPaddedHex(BigInt(data_stream_merkle_proof[3]))
        ])

        return {proofs: return_proofs, public_inputs: return_public_inputs}

    }

    

    
}