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
import { cryptoTools } from "@nihilium/zkp-circuits";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class DefaultAnchoredOpeningProofModule extends UnsealConditionModule {
    
    
    private opening_proof:UnsealConditionProof;
    private top_level_merkle_tree_proof:UnsealConditionProof;
    private sub_tree_merkle_tree_proof:UnsealConditionProof;
    private keccack_tree_hash_proof:UnsealConditionProof;

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("UnsealOpeningModule", 
            "Opening Module", proofLibrary);
            this.description = `
                This module is the starting module for all further unseal conditions.
                It validates the opening proof and sets the metadata, timestamp and merkle roots.
                It validates two tree, the top level tree, which is anchored on chain.
                And the sub tree, this is a tree constructed off chain. It's root is combined with
                a timestamp to produce a leaf value for the top level tree.
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
                description: "The hash of a merkle root of a tree that can attach metadata to the unseal conditions",
                required: true
            },
        }
        
        
        
        this.opening_proof = proofLibrary.getProof("opening_proof");
        this.top_level_merkle_tree_proof = proofLibrary.getProof("TopLevelMerkleProof");
        this.sub_tree_merkle_tree_proof = proofLibrary.getProof("MerkleTreeProof");
        this.keccack_tree_hash_proof = proofLibrary.getProof("KeccakTreeEntry");

        var opening_proof_id = this.addProof(this.opening_proof);
        
        var keccack_tree_hash_proof_id = this.addProof(this.keccack_tree_hash_proof);
        var sub_tree_merkle_tree_proof_id = this.addProof(this.sub_tree_merkle_tree_proof);
        var top_level_merkle_tree_proof_id = this.addProof(this.top_level_merkle_tree_proof);
        

        this.addSignalEdge(undefined, opening_proof_id, ["metadata_root_hash", "metadata_root_hash"], ModuleEdgeInput.user_input);
        this.addSignalEdge(opening_proof_id, keccack_tree_hash_proof_id, ["reveal_value", "plain_value"], ModuleEdgeInput.signal_pass);
        this.addSignalEdge(keccack_tree_hash_proof_id, sub_tree_merkle_tree_proof_id, ["tree_entry", "leaf_value"], ModuleEdgeInput.signal_pass);
        this.addSignalEdge(sub_tree_merkle_tree_proof_id, top_level_merkle_tree_proof_id, ["merkle_root", "subtree_root"], ModuleEdgeInput.signal_pass);

        //Represents a static input from the user
       
        
        
    
        this.outputs = {
           
            reveal_value: {
                name: "reveal_value",
                type_order: ["String"],
                proof_key: opening_proof_id,
                signal_key: "reveal_value",
                description: "The reveal value, this value is anchored on chain and is a signal that can be externally observed",
                
            },
            reveal_value_tree_hash: {
                name: "reveal_value_tree_hash",
                type_order: ["String"],
                proof_key: keccack_tree_hash_proof_id,
                signal_key: "tree_entry",
                description: "The reveal value tree hash, which is keccak(reveal_value, 0)",
                
            },
            top_level_merkle_root: {
                name: "top_level_merkle_root",
                type_order: ["String", "Randomness"], //This root is defined by a mined block
                proof_key: top_level_merkle_tree_proof_id,
                signal_key: "merkle_root",
                description: "The top level merkle root, is used to validate against a datastream.",
                
            },
            sub_tree_merkle_root: {
                name: "sub_tree_merkle_root",
                type_order: ["String"], //Not randomness as influencable by datastream
                proof_key: sub_tree_merkle_tree_proof_id,
                signal_key: "merkle_root",
                description: "The merkle root of a tree that is constructed off chain",
                
            },
           
            metadata_root_hash: {
                name: "metadata_root_hash",
                type_order: ["String"],
                proof_key: opening_proof_id,
                signal_key: "metadata_root_hash", //TODO not actually there
                description: "The metadata root hash",
                
            },
            timestamp: {
                name: "timestamp",
                type_order: ["Timestamp", "Number"],
                proof_key: top_level_merkle_tree_proof_id,
                signal_key: "block_timestamp",
                description: "The timestamp of the block that contains the reveal value",
                
            },
            sub_tree_index: {
                name: "sub_tree_index",
                type_order: ["Number"], //Not randomness as influencable by datastream
                proof_key: sub_tree_merkle_tree_proof_id,
                signal_key: "index",
                description: "The index of the leaf of the sub tree",
                
            },
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
    async produce_proofs(dataStream: IDataStream, processor:ProcessorEndpoint, opening_proof:any, opening_public_inputs: any[]): Promise<ModuleProof> {
       // var oproof =typeof opening_proof !== "string" ? opening_proof : cryptoTools.hexString2Buffer(opening_proof);
        var return_proofs = [opening_proof];
        var return_public_inputs = [opening_public_inputs];
        var reveal_value = opening_public_inputs[this.opening_proof.getSignalIndex("reveal_value")[0]];
        var data_stream_merkle_proof:[ProofPath, ProofPath, number, number, number] = await dataStream.getProof(reveal_value); //global, subtree
        
        var reveal_value_hash = keccakTreeHasher(reveal_value, 0n)
        var ph = toPaddedHex;

        return_proofs.push("0x");
        return_public_inputs.push([
            toPaddedHex(BigInt(reveal_value)), 
            toPaddedHex(BigInt(reveal_value_hash)),
        ])
        return_proofs.push("0x" + data_stream_merkle_proof[1].pathElements.map(element => toPaddedHex(BigInt(element.toString())).slice(2)).join(""))
        return_public_inputs.push([
             toPaddedHex(BigInt(data_stream_merkle_proof[1].pathRoot.toString())), 
             toPaddedHex(BigInt(reveal_value_hash)), 
             toPaddedHex(BigInt(data_stream_merkle_proof[4]))
        ])
        
        
        return_proofs.push("0x" + data_stream_merkle_proof[0].pathElements.map(element => toPaddedHex(BigInt(element.toString())).slice(2)).join(""))
        //TODO DO THIS=========set the public inputs
        //return_public_inputs.push(top_level_merkle_proof.publicSignals)
        return_public_inputs.push([
            toPaddedHex(BigInt(data_stream_merkle_proof[0].pathRoot.toString())),
            toPaddedHex(BigInt(data_stream_merkle_proof[2])), 
            toPaddedHex(BigInt(data_stream_merkle_proof[0].pathRoot.toString())), 
            toPaddedHex(BigInt(data_stream_merkle_proof[3]))
        ])

        return {proofs: return_proofs, 
            public_inputs: return_public_inputs, 
            //TODO: automate this from the signals
            outputs: {
                ["top_level_merkle_root"]: toPaddedHex(BigInt(data_stream_merkle_proof[0].pathRoot.toString()))
                // ["sub_tree_merkle_root"]: sub_tree_merkle_tree_proof_id,
                // ["reveal_value_tree_hash"]: keccack_tree_hash_proof_id,
                // ["reveal_value"]: opening_proof_id,
                // ["metadata_root_hash"]: opening_proof_id,
                // ["timestamp"]: top_level_merkle_tree_proof_id,
            }}

    }

    

    
}