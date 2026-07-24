//NOTE DEPRECATED
import { ethers, keccak256, Signer } from "ethers";
import { ChainedProofWrapper } from "../contract_wrappers/ChainedProofWrapper";
import { toPaddedHex } from "../utils";
import { UnsealProofAction } from "./types";

//ACTION_start_unsealing is to be replaced with prepare_next_proof
//export const ACTION_START_UNSEALING = "start_unsealing";
export const ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
export const ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";
export const ACTION_CHAIN_PROOF_FORK = "chain_proof_fork";
export const ACTION_CHAIN_PROOF_FORK_END = "chain_proof_fork_end";

export const ACTION_STATIC_INPUT = "static_input";
export const ACTION_PASS_SIGNAL = "pass_signal";
//Place holder for user input, should be replaced with static_input
export const ACTION_STATIC_INPUT_FROM_USER = "static_input_from_user";

export const ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT = "validate_data_root_from_user_input";
export const ACTION_VALIDATE_DATA_ROOT = "validate_data_root";


export interface ProvingState {
    current_hash: string;
    //expected_hash: string;
    current_index: number;
    verifier_must_be_true: boolean;
    outputs: string[][];
    prepared_public_inputs: string[];
    prepared_proof: string;
    proof_verifier: string;
   // commited_processor_public_key: number[];
    initiator: string;
    
}

export class ChainedProof {
    provingStates: Map<string, ProvingState>;
    private public_proof_verifier: string;
    private forced_opening_verifier: string;
    private chainedProofWrapper?: ChainedProofWrapper;
    constructor(public_proof_verifier: string, forced_opening_verifier: string, provider: ethers.Provider | undefined = undefined, signer: Signer | undefined = undefined) {
        this.provingStates = new Map();
        this.public_proof_verifier = public_proof_verifier;
        this.forced_opening_verifier = forced_opening_verifier;
        if (provider) {
            this.chainedProofWrapper = new ChainedProofWrapper(provider, signer);
        }
    }

    async initializeSolidity(): Promise<void> {
        if (this.chainedProofWrapper) {
            await this.chainedProofWrapper.attach(this.public_proof_verifier);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }


    private async has_data_stream_root(state: ProvingState, datastream: string, root: string): Promise<ProvingState> {
        // Implementation would depend on DualMerkleTree contract interactio
        // n
        const new_state = { ...state };
        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_VALIDATE_DATA_ROOT]
        ));
      
        return new_state;
    }


    async solidity_dryrun_prepare_next_proof(state: ProvingState, verifier_address: string, verifierMustBeTrue: boolean, publicInputs: string[], proof: string): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunPrepareNextProof(state, verifier_address, verifierMustBeTrue, publicInputs.map(input => ethers.zeroPadValue(input, 32)), proof);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }


    static dryrun_prepare_next_proof(state: ProvingState, verifier_address: string, verifierMustBeTrue: boolean, publicInputs: string[], proof: string): ProvingState {
        const new_state = { ...state };
        if(new_state.current_hash == "0x0000000000000000000000000000000000000000000000000000000000000000" 
            || new_state.current_hash == undefined || new_state.current_hash == null || new_state.current_hash == "") {
            new_state.current_hash = keccak256(ethers.solidityPacked(["address"], [verifier_address]));
        }
        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "address", "bool"],
            [new_state.current_hash, verifier_address, verifierMustBeTrue]
        ));
        new_state.prepared_public_inputs = publicInputs;
        new_state.prepared_proof = proof;
        new_state.proof_verifier = verifier_address;
        new_state.verifier_must_be_true = verifierMustBeTrue;
        return new_state;
    }

    async solidity_dryrun_validate_data_root(state: ProvingState, datastream: string, output_proof_index: number, output_signal_index: number): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunValidateDataRoot(state, datastream, output_proof_index, output_signal_index);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    static async dryrun_validate_data_root(
        state: ProvingState, 
        address: string,       
        output_proof_index: number,
        output_signal_index: number,
        
    ): Promise<ProvingState> {
        const new_state = { ...state };
        // if (!new_state.prepared_proof || !new_state.prepared_public_inputs.length || !new_state.proof_verifier) {
        //     throw new Error("Invalid state");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string","address", "uint256", "uint256"],
            [new_state.current_hash, ACTION_VALIDATE_DATA_ROOT, address, output_proof_index, output_signal_index]
        ));


      

        return new_state;
    }




    async solidity_dryrun_chain_static_input(state: ProvingState, value: bigint, public_input_index: number): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunChainStaticInput(state, value, public_input_index);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    static dryrun_chain_static_input(
        state: ProvingState,
        value: bigint,
        public_input_index: number
    ): ProvingState {
        const new_state = { ...state };
        // if (indexes.length !== inputs.length || !new_state.prepared_proof) {
        //     throw new Error("Invalid inputs");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_STATIC_INPUT]
        ));
        //for (let i = 0; i < indexes.length; i++) {
            //new_state.prepared_public_inputs[indexes[i]] = inputs[i];
            new_state.current_hash = keccak256(ethers.solidityPacked(
                ["bytes32", "uint256", "bytes32"],
                [new_state.current_hash, public_input_index, toPaddedHex(value, 32)]
            ));
        //}

        return new_state;
    }

    async solidity_dryrun_chain_pass_signal(state: ProvingState, public_input_indexes: number[], output_proof_index: number, output_signal_indexes: number[], dryrun_mode: boolean = false): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunChainPassSignal(state, public_input_indexes, output_proof_index, output_signal_indexes, dryrun_mode);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    static dryrun_chain_pass_signal(
        state: ProvingState,
        public_input_indexes: number[],
        output_proof_index: number,
        output_signal_indexes: number[],
        dryrun_mode: boolean = false
    ): ProvingState {
        const new_state = { ...state };
        // if (public_input_indexes.length !== output_indexes.length || !new_state.prepared_proof) {
        //     throw new Error("Invalid inputs");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_PASS_SIGNAL]
        ));
        for (let i = 0; i < public_input_indexes[1]; i++) {
            if (!dryrun_mode) {
                new_state.prepared_public_inputs[public_input_indexes[0] + i] = 
                    new_state.outputs[output_proof_index][output_signal_indexes[0] + i];
            }
           
            new_state.current_hash = keccak256(ethers.solidityPacked(
                ["bytes32", "uint256", "uint256", "uint256"],
                [new_state.current_hash, public_input_indexes[0] + i, output_proof_index, output_signal_indexes[0] + i]
            ));
        }

        return new_state;
    }

    async solidity_dryrun_chain_proof_verify(state: ProvingState, ignore_proof: boolean): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunChainProofVerify(state, ignore_proof);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    static async dryrun_chain_proof_verify(state: ProvingState, ignore_proof: boolean): Promise<ProvingState> {
        const new_state = { ...state };
        // if (!ignore_proof && (!new_state.prepared_proof || !new_state.prepared_public_inputs.length || !new_state.proof_verifier)) {
        //     throw new Error("Invalid state");
        // }

        if (!ignore_proof) {
            // Implementation would depend on verifier contract interaction
            // await this.verifyProof(new_state.prepared_proof, new_state.prepared_public_inputs);
        }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "address"],
            [new_state.current_hash, new_state.proof_verifier]
        ));

        
        //new_state.outputs.push(new_state.prepared_public_inputs);

        new_state.prepared_proof = "";
        new_state.prepared_public_inputs = [];

        return new_state;
    }

static async calculateUnsealRoot(unseal_proof_actions: UnsealProofAction[]): Promise<string> {
    var proof_counter = 0;
    var proof_state: any | ProvingState = {};
    for(var action of unseal_proof_actions) {      
        // if(action.action === ACTION_START_UNSEALING) {
        //     proof_state = await this.chainedProof.dryrun_start_proving(action.params.verifier_address, dryrun ? [] : public_inputs[proof_counter], dryrun ? [] : proofs[proof_counter])
        //     proof_counter++;
        // }
        if(action.action === ACTION_PREPARE_NEXT_PROOF) {
            proof_state = await ChainedProof.dryrun_prepare_next_proof(proof_state,
                 action.params.verifier_address, 
                 action.params.verifier_must_be_true,
                 [] , "")
            proof_counter++;
        }
        if(action.action === ACTION_CHAIN_PROOF_VERIFY) {
            proof_state = await ChainedProof.dryrun_chain_proof_verify(proof_state, true)
        }
        if(action.action === ACTION_PASS_SIGNAL) {
            proof_state = await ChainedProof.dryrun_chain_pass_signal(proof_state, 
                action.params.public_input_indexes, 
                action.params.output_proof_index, 
                action.params.output_signal_indexes, true)
        }
        if(action.action === ACTION_STATIC_INPUT) {
            proof_state = await ChainedProof.dryrun_chain_static_input(proof_state,
                action.params.value,
                action.params.public_input_index)
        }
        if(action.action === ACTION_VALIDATE_DATA_ROOT) {
            proof_state = await ChainedProof.dryrun_validate_data_root(
                proof_state,                     
                action.params.address, 
                action.params.output_proof_index, 
                action.params.output_signal_index, 
            )
        }
        if(action.action === ACTION_STATIC_INPUT_FROM_USER) {
                throw new Error("ACTION_STATIC_INPUT_FROM_USER should have been handled before this point");
        }
        if(action.action === ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT) {
            throw new Error("ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT should have been handled before this point");
    }
        console.log(action.action, proof_state.current_hash)
        
    }

    console.log("Final root: ", toPaddedHex(BigInt(proof_state.current_hash) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n))
    return toPaddedHex(BigInt(proof_state.current_hash) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n);
}


   
}
