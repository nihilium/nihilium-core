import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_START_UNSEALING, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../base_functions/ChainedProof";
import { TopLevelTreeProof } from "../base_functions/zk_proofs/002_top_level_tree_proof";
import { SubTreeProof } from "../base_functions/zk_proofs/001_sub_tree_proof";
import { ProofMode } from "../base_functions/zk_proofs/types";
import { ChainedProofCollection, UnsealProofAction } from "./types";
import { IDataStream } from "../../data_stream/types";
import { ethers, Signer } from "ethers";
import { UnsealOpeningProof } from "../base_functions/zk_proofs/000_unseal_opening_proof";
import { ProofPath } from "fixed-merkle-tree";
import { ProcessorEndpoint } from "../../../types/protocol/common";
import { createMimcMerkelTree, toPaddedHex, keccakTreeHasher } from "../../utils";
import { hexToBytes } from "@noble/hashes/utils";






/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class RevealOnlyCollectionNormalTrees extends ChainedProofCollection {
    
    private top_level_merkle_tree_address: string;
    private sub_tree_merkle_tree_address: string;
    protected proof_order: string[];
    protected chainedProof:ChainedProof;
    private opening_proof:UnsealOpeningProof;
    private top_level_merkle_tree_proof:TopLevelTreeProof;
    private sub_tree_merkle_tree_proof:SubTreeProof;
 
    protected unseal_proof_actions: UnsealProofAction[] = []

    constructor(
        opening_proof_address: string,
        top_level_merkle_tree_address: string,
        sub_tree_merkle_tree_address: string,
        datastreams: IDataStream[],
        provider: ethers.Provider | undefined = undefined,
        signer: Signer | undefined = undefined
    ){
        super(opening_proof_address, datastreams, provider, signer);
        this.opening_proof_address = opening_proof_address;
        this.opening_proof = new UnsealOpeningProof(this.opening_proof_address);
        this.top_level_merkle_tree_address = top_level_merkle_tree_address;
        this.sub_tree_merkle_tree_address = sub_tree_merkle_tree_address;
        this.chainedProof = new ChainedProof(this.opening_proof_address, this.sub_tree_merkle_tree_address, provider, signer);
        this.top_level_merkle_tree_proof = new TopLevelTreeProof(this.top_level_merkle_tree_address, null, ProofMode.CREATE_REVEAL_ROOT);
        this.sub_tree_merkle_tree_proof = new SubTreeProof(this.sub_tree_merkle_tree_address)
        this.proof_order = [this.opening_proof_address, this.sub_tree_merkle_tree_address, this.top_level_merkle_tree_address];
        this.unseal_proof_actions = [
            {action: ACTION_START_UNSEALING, params: {verifier_address: this.opening_proof_address}},
            {action: ACTION_PREPARE_NEXT_PROOF, params: {verifier_address: this.sub_tree_merkle_tree_address}},
            {action: ACTION_CHAIN_PROOF_VERIFY, params: {verifier_address: this.sub_tree_merkle_tree_address}},
            {action: ACTION_PREPARE_NEXT_PROOF, params: {verifier_address: this.top_level_merkle_tree_address}},
            {action: ACTION_PASS_SIGNAL, params: {
                public_input_indexes: [this.top_level_merkle_tree_proof.get_output_index("subtree_root")[0]], 
                output_proof_indexes: [1],
                output_signal_indexes: [this.sub_tree_merkle_tree_proof.get_output_index("computed_root")[0]]}},
            {action: ACTION_VALIDATE_DATA_ROOT, params: {datastream: [0], 
                public_input_index: this.top_level_merkle_tree_proof.get_output_index("computed_root")[0],
                merkle_root_index: 0
            }},
            {action: ACTION_CHAIN_PROOF_VERIFY, params: {verifier_address: this.top_level_merkle_tree_address}},
        ];
        createMimcMerkelTree(20, [])
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
    override getConstructorFields(): {[key:string]:any} {
        return {
            opening_proof_address: this.opening_proof_address,
            top_level_merkle_tree_address: this.top_level_merkle_tree_address,
            sub_tree_merkle_tree_address: this.sub_tree_merkle_tree_address,
        }
    }
    override getCollectionId(): string {
        return "reveal_only_normal_trees";
    }

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