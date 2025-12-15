import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_START_UNSEALING, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../ChainedProof";
import { TopLevelTreeProof } from "../proofs/lib/002_top_level_tree_proof";
import { SubTreeProof } from "../proofs/lib/001_sub_tree_proof";
import { ProofMode } from "../proofs/zk_proofs/types";
import { CompiledChainedProofCollection, UnsealProofAction } from "../types";
import { IDataStream } from "../../data_stream/types";
import { ethers, Signer } from "ethers";
import { UnsealOpeningProof } from "../proofs/lib/000_unseal_opening_proof";
import { ProofPath } from "fixed-merkle-tree";
import { ProcessorEndpoint } from "../../../types/protocol/common";
import { createMimcMerkelTree, toPaddedHex, keccakTreeHasher } from "../../utils";
import { hexToBytes } from "@noble/hashes/utils";
import { IOMap, ModuleEdge, ModuleEdgeInput, ModuleNode, UnsealConditionModule } from "./types";
import { UnsealConditionProof } from "../proofs/types";
import { ProofLibraryType } from "../proofs";




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
    // private inputs: IOMap;
    // private outputs: IOMap;
    
    // protected unseal_proofs: UnsealConditionProof[] = [

    // ];
    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("DefaultAnchoredOpeningProof", "Default Anchored Opening Proof", proofLibrary);
        this.inputs = {
            metadata_root_hash: {
                type_order: ["String"],
                user_input: true,
                description: "The metadata root hash",
                required: true
            },
        }
        this.outputs = {
            reveal_value: {
                type_order: ["String"],
                user_input: false,
                description: "The reveal value",
                required: true
            },
            sub_tree_merkle_root: {
                type_order: ["String"],
                user_input: false,
                description: "The sub tree merkle root",
                required: true
            },
            top_level_merkle_root: {
                type_order: ["String", "Randomness"],
                user_input: false,
                description: "The top level merkle root",
                required: true
            },
            metadata_root_hash: {
                type_order: ["String"],
                user_input: false,
                description: "The metadata root hash",
                required: true
            },
            timestamp: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The timestamp",
                required: true
            }
        }
        
        
        this.opening_proof = new proofLibrary.standard["UnsealOpeningProof"]() as UnsealOpeningProof;
        this.top_level_merkle_tree_proof = new proofLibrary.standard["TopLevelTreeProof"]() as TopLevelTreeProof;
        this.sub_tree_merkle_tree_proof = new proofLibrary.standard["SubTreeProof"]() as SubTreeProof;
        
        this.nodes["opening_proof"] = new ModuleNode("opening_proof", this.opening_proof, [this.inputs["metadata_root_hash"]]);
        this.nodes["top_level_merkle_tree_proof"] = new ModuleNode("top_level_merkle_tree_proof", this.top_level_merkle_tree_proof, []);
        this.nodes["sub_tree_merkle_tree_proof"] = new ModuleNode("sub_tree_merkle_tree_proof", this.sub_tree_merkle_tree_proof, []);
        
        //Represents a static input from the user
        this.edges["opening_proof_metadata_root_hash"] = new ModuleEdge("opening_proof_metadata_root_hash", 
            undefined,
            this.nodes["opening_proof"], 
            ["metadata_root_hash", "metadata_root_hash"], 
            ModuleEdgeInput.user_input);

        this.edges["opening_proof_to_sub_tree_merkle_tree_proof_reveal_value"] = 
                 new ModuleEdge("opening_proof_to_sub_tree_merkle_tree_proof_reveal_value", 
                    this.nodes["opening_proof"], 
                    this.nodes["sub_tree_merkle_tree_proof"], 
                    ["reveal_value", "reveal_value"], ModuleEdgeInput.signal_pass);

        this.edges["sub_tree_merkle_tree_to_top_level_merkle_tree_proof_subtree_root"] = 
                new ModuleEdge("sub_tree_merkle_tree_to_top_level_merkle_tree_proof_subtree_root", 
                   this.nodes["sub_tree_merkle_tree_proof"], 
                   this.nodes["top_level_merkle_tree_proof"], 
                   ["computed_root", "subtree_root"], ModuleEdgeInput.signal_pass);
    
   
   
        // this.unseal_proof_actions = [
        //     {action: ACTION_START_UNSEALING, params: {verifier_address: this.opening_proof_address}},
        //     {action: ACTION_PREPARE_NEXT_PROOF, params: {verifier_address: this.sub_tree_merkle_tree_address}},
        //     {action: ACTION_CHAIN_PROOF_VERIFY, params: {verifier_address: this.sub_tree_merkle_tree_address}},
        //     {action: ACTION_PREPARE_NEXT_PROOF, params: {verifier_address: this.top_level_merkle_tree_address}},
        //     {action: ACTION_PASS_SIGNAL, params: {
        //         public_input_indexes: [this.top_level_merkle_tree_proof.get_output_index("subtree_root")[0]], 
        //         output_proof_indexes: [1],
        //         output_signal_indexes: [this.sub_tree_merkle_tree_proof.get_output_index("computed_root")[0]]}},
        //     {action: ACTION_VALIDATE_DATA_ROOT, params: {datastream: [0], 
        //         public_input_index: this.top_level_merkle_tree_proof.get_output_index("computed_root")[0],
        //         merkle_root_index: 0
        //     }},
        //     {action: ACTION_CHAIN_PROOF_VERIFY, params: {verifier_address: this.top_level_merkle_tree_address}},
        // ];
        //createMimcMerkelTree(20, [])
          // var proof_state = await this.chainedProof.dryrun_start_proving(this.opening_proof_address, openingProofPublicInputs, openingProof)
        // //We just need to prove the tree here, no additional inputs needed
        // proof_state = await this.chainedProof.dryrun_prepare_next_proof(proof_state, this.sub_tree_merkle_tree_address, subTreeProofPublicInputs, subTreeProof)
        // proof_state = await this.chainedProof.dryrun_chain_proof_verify(proof_state, dryrun)

        // //Prepare the top level tree proof
        // proof_state = await this.chainedProof.dryrun_prepare_next_proof(proof_state, this.top_level_merkle_tree_address, topLevelTreeProofPublicInputs, topLevelTreeProof)
        // //We now need to chain the sub tree proof to the top level tree proof
        // var suggested_chained_inputs = this.top_level_merkle_tree_proof.get_suggested_chained_inputs()
        // proof_state = await this.chainedProof.dryrun_chain_pass_signal(proof_state,
        //     [this.top_level_merkle_tree_proof.get_output_index("subtree_root")[0]],// We want to replace the subtree root
        //     [this.sub_tree_merkle_tree_proof.get_output_index("computed_root")[0]], //With the computed root of the sub tree proof
        //     [0] //This is the index of the output proof (which is the sub_tree_proof)
        // , dryrun)
        // proof_state = await this.chainedProof.dryrun_chain_proof_verify(proof_state, dryrun)
        // var unseal_root = proof_state.current_hash;
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

    async produce_proofs(dataStream: IDataStream, processor:ProcessorEndpoint, opening_proof:any, opening_public_inputs: any[]): Promise<any> {
        var return_proofs = [opening_proof];
        var return_public_inputs = [opening_public_inputs];
        var reveal_value = opening_public_inputs[this.opening_proof.get_output_index("reveal_value")[0]];
        var data_stream_merkle_proof:[ProofPath, ProofPath, number, number, number] = await dataStream.getProof(reveal_value); //global, subtree
        var tt = data_stream_merkle_proof[0].pathElements.map(element => toPaddedHex(BigInt(element)))
        var reveal_value_hash = keccakTreeHasher(reveal_value, 0n)
        // var sub_level_merkle_proof = await this.sub_tree_merkle_tree_proof.create_proof({
        //     leaf_value: reveal_value_hash,
        //     root: data_stream_merkle_proof[1].pathRoot.toString(),
        //     path: data_stream_merkle_proof[1].pathElements.map(element => element.toString().slice(2)).join(""),
        //     index_bits: data_stream_merkle_proof[1].pathIndices.map(index => index.toString())
        // });
        return_proofs.push(hexToBytes(data_stream_merkle_proof[1].pathElements.map(element => toPaddedHex(BigInt(element.toString())).slice(2)).join("")))
        return_public_inputs.push([
             toPaddedHex(BigInt(data_stream_merkle_proof[1].pathRoot.toString())), 
             toPaddedHex(BigInt(reveal_value_hash)), 
             toPaddedHex(BigInt(data_stream_merkle_proof[4]))
        ])
        // subtree_root: Field;
        // block_timestamp: Field;
        // root: Field;
        // path: Field[];
        // index_bits: u1[];

        // var top_level_merkle_proof = await this.top_level_merkle_tree_proof.create_proof({
        //     subtree_root: data_stream_merkle_proof[1].pathRoot.toString(),
        //     block_timestamp: data_stream_merkle_proof[2].toString(),
        //     root: data_stream_merkle_proof[0].pathRoot.toString(),
        //     path: data_stream_merkle_proof[0].pathElements.map(element => element.toString()),
        //     index_bits: data_stream_merkle_proof[0].pathIndices.map(index => index.toString())
        // });
        
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