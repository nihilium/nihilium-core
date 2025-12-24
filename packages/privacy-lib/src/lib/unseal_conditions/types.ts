import { ethers, Signer } from "ethers";
import { IDataStream } from "../data_stream/types";
import { ACTION_CHAIN_PROOF_FORK, ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_STATIC_INPUT_FROM_USER, ACTION_STATIC_INPUT, ACTION_VALIDATE_DATA_ROOT } from "./ChainedProof";
import { ACTION_PREPARE_NEXT_PROOF } from "./ChainedProof";
import { ProvingState } from "./ChainedProof";
import { ChainedProof } from "./ChainedProof";
import { ProcessorEndpoint } from "../../types/protocol/common";
import { toPaddedHex } from "../utils";

export type ProofMode = "PROOF" | "BRANCH" | "MERGE"


export abstract class CompiledChainedProofCollection {
    protected unseal_proof_actions: UnsealProofAction[] = [];
    protected opening_proof_address: string;
    protected proof_order: string[] = [];
    protected chainedProof: ChainedProof;
    protected datastreams: IDataStream[];
    protected signer: Signer | undefined;
    protected provider: ethers.Provider | undefined;
    constructor(opening_proof_address: string, datastreams: IDataStream[], provider: ethers.Provider | undefined = undefined, signer: Signer | undefined = undefined) {
        this.opening_proof_address = opening_proof_address;
        this.datastreams = datastreams;
        this.chainedProof = new ChainedProof(this.opening_proof_address, this.opening_proof_address, provider, signer);
        this.signer = signer;
        this.provider = provider;
    }
    abstract getCollectionId(): string;
    abstract getConstructorFields(): {[key:string]:any} ;

    getUnsealProofActions(): UnsealProofAction[] {
        return this.unseal_proof_actions;
    }

    abstract produce_proofs(dataStream: IDataStream, processor:ProcessorEndpoint, opening_proof:any, opening_public_inputs: any[]): Promise<{proofs:any[], public_inputs:any[][]}>;

    getDatastreams(): IDataStream[] {
        return this.datastreams;
    }

    getAddress(): string {
        return this.opening_proof_address;
    }
    //TODO get the datastream from a merkle proof
    async verifySolidity(dryrun: boolean = true, dataStreamAddress: string, proofs: any[] = [], public_inputs: any[][] = []): Promise<string> {
        if(!dryrun) {           
            if(public_inputs.length != proofs.length) {
                throw new Error("Number of public inputs must match the number of proofs in the proof order");
            }            
        }
        console.log("Data stream address: " + dataStreamAddress)
        var proof_counter = 0;
        var proof_state: any | ProvingState = {};
        for(var action of this.unseal_proof_actions) {
            console.log(action)
            // if(action.action === ACTION_START_UNSEALING) {
            //     proof_state = await this.chainedProof.solidity_dryrun_start_proving(action.params.verifier_address, public_inputs[proof_counter], proofs[proof_counter], true)
            //     proof_counter++;
            // }
            if(action.action === ACTION_PREPARE_NEXT_PROOF) {
                proof_state = await this.chainedProof.solidity_dryrun_prepare_next_proof(proof_state, action.params.verifier_address, action.params.verifier_must_be_true, public_inputs[proof_counter], proofs[proof_counter])
                proof_counter++;
            }
            if(action.action === ACTION_CHAIN_PROOF_VERIFY) {
                proof_state = await this.chainedProof.solidity_dryrun_chain_proof_verify(proof_state, dryrun)
            }
            if(action.action === ACTION_PASS_SIGNAL) {
                proof_state = await this.chainedProof.solidity_dryrun_chain_pass_signal(proof_state, 
                    action.params.public_input_indexes, 
                    action.params.output_proof_index, 
                    action.params.output_signal_indexes, dryrun)
            }
            if(action.action === ACTION_STATIC_INPUT) {
                proof_state = await this.chainedProof.solidity_dryrun_chain_static_input(proof_state,
                    action.params.inputs,
                    action.params.public_input_indexes)
            }
            if(action.action === ACTION_VALIDATE_DATA_ROOT) {
                proof_state = await this.chainedProof.solidity_dryrun_validate_data_root(
                    proof_state, 
                    dataStreamAddress,                    
                    action.params.public_input_index, 
                    action.params.is_delayed_proof, 
                    action.params.optional_dual_tree_proof, 
                    action.params.optional_dual_tree_public_inputs,
                    action.params.merkle_root_index)
            }
            console.log(action.action, proof_state.current_hash)
        }

        //TODO make sure it is within field
        return toPaddedHex(BigInt(proof_state.current_hash) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n)
    }

    async getUnsealRoot(dryrun: boolean = true, proofs: any[] = [], public_inputs: any[][] = []): Promise<string> {
        //Make sure proofs and inputs are correct
        if(!dryrun) {
            if(proofs.length != public_inputs.length) {
                throw new Error("Number of public inputs must match the number of proofs in the proof order");
            }            
        }
        
        var proof_counter = 0;
        var proof_state: any | ProvingState = {};
        for(var action of this.unseal_proof_actions) {      
            // if(action.action === ACTION_START_UNSEALING) {
            //     proof_state = await this.chainedProof.dryrun_start_proving(action.params.verifier_address, dryrun ? [] : public_inputs[proof_counter], dryrun ? [] : proofs[proof_counter])
            //     proof_counter++;
            // }
            if(action.action === ACTION_PREPARE_NEXT_PROOF) {
                proof_state = await this.chainedProof.dryrun_prepare_next_proof(proof_state,
                     action.params.verifier_address, 
                     action.params.verifier_must_be_true,
                     dryrun ? [] : public_inputs[proof_counter], dryrun ? [] : proofs[proof_counter])
                proof_counter++;
            }
            if(action.action === ACTION_CHAIN_PROOF_VERIFY) {
                proof_state = await this.chainedProof.dryrun_chain_proof_verify(proof_state, dryrun)
            }
            if(action.action === ACTION_PASS_SIGNAL) {
                proof_state = await this.chainedProof.dryrun_chain_pass_signal(proof_state, 
                    action.params.public_input_indexes, 
                    action.params.output_proof_indexes, 
                    action.params.output_signal_indexes, dryrun)
            }
            if(action.action === ACTION_STATIC_INPUT) {
                proof_state = await this.chainedProof.dryrun_chain_static_input(proof_state,
                    action.params.value,
                    action.params.public_input_index)
            }
            if(action.action === ACTION_VALIDATE_DATA_ROOT) {
                proof_state = await this.chainedProof.dryrun_validate_data_root(
                    proof_state,                     
                    action.params.public_input_index, 
                    action.params.is_delayed_proof, 
                    action.params.optional_dual_tree_proof, 
                    action.params.optional_dual_tree_public_inputs,
                    action.params.merkle_root_index)
            }
            console.log(action.action, proof_state.current_hash)
            
        }

      
        return toPaddedHex(BigInt(proof_state.current_hash) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n);
    }

    getProofOrder(): string[] {
        return this.proof_order;
    }
    
}
//Action and params are used during unseal_root calculation
export type UnsealProofAction = {

    action: string;
    
    params: any;
}

export type UnsealProofActionPrepareNextProof = UnsealProofAction & {
    action: typeof ACTION_PREPARE_NEXT_PROOF;
    params: {
        verifier_address: string;
        verifier_must_be_true: boolean;
    }
}
export type UnsealProofActionChainProofVerify = UnsealProofAction & {
    action: typeof ACTION_CHAIN_PROOF_VERIFY;
    params: {
        
    }
}
export type UnsealProofActionPassSignal = UnsealProofAction & {
    action: typeof ACTION_PASS_SIGNAL;
    params: {
        public_input_indexes: number[];
        output_proof_indexes: number[];
        output_signal_indexes: number[];
    }
}

//This is used during compilation of the module to be replaced during compilation
//of the collection.
export type UnsealProofActionStaticInputFromUser = UnsealProofAction & {
    action: typeof ACTION_STATIC_INPUT_FROM_USER;
    params: {
        
        public_input_index: [number, number];//index and range
        
        
    }
}

export type UnsealProofActionStaticInput = UnsealProofAction & {
    action: typeof ACTION_STATIC_INPUT;
    params: {
        public_input_index: number;
        value: any;
    }
}
    
