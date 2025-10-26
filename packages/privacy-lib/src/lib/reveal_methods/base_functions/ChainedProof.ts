import { ethers, keccak256, Signer } from "ethers";
import { ChainedProofWrapper } from "../../contract_wrappers/ChainedProofWrapper";

export const ACTION_START_UNSEALING = "start_unsealing";
export const ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
export const ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";

export const ACTION_STATIC_INPUT = "static_input";
export const ACTION_PASS_SIGNAL = "pass_signal";
export const ACTION_PASS_SIGNAL_PLUSONE = "pass_signal_plusone";
export const ACTION_VALIDATE_TIMESTAMP = "validate_timestamp";
export const ACTION_VALIDATE_DATA_ROOT = "validate_data_root";


export interface ProvingState {
    current_hash: string;
    expected_hash: string;
    current_index: number;
    outputs: string[][];
    prepared_public_inputs: string[];
    prepared_proof: string;
    proof_verifier: string;
    commited_processor_public_key: string[];
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


    async solidity_dryrun_prepare_next_proof(state: ProvingState, verifier_address: string, publicInputs: string[], proof: string): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunPrepareNextProof(state, verifier_address, publicInputs.map(input => ethers.zeroPadValue(input, 32)), proof);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }


    dryrun_prepare_next_proof(state: ProvingState, verifier_address: string, publicInputs: string[], proof: string): ProvingState {
        const new_state = { ...state };
        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "address"],
            [new_state.current_hash, verifier_address]
        ));
        new_state.prepared_public_inputs = publicInputs;
        new_state.prepared_proof = proof;
        new_state.proof_verifier = verifier_address;
        return new_state;
    }

    async solidity_dryrun_validate_data_root(state: ProvingState, datastream: string, publicInputIndex: number, isDelayedProof: boolean, optionalDualTreeProof: string, optionalDualTreePublicInputs: string[], merkleRootIndex: number): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunValidateDataRoot(state, datastream, publicInputIndex, isDelayedProof, optionalDualTreeProof, optionalDualTreePublicInputs, merkleRootIndex);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    async dryrun_validate_data_root(
        state: ProvingState,        
        public_input_index: number,
        is_delayed_proof: boolean,
        optional_dual_tree_proof: string,
        optional_dual_tree_public_inputs: string[],
        merkle_root_index: number
    ): Promise<ProvingState> {
        const new_state = { ...state };
        // if (!new_state.prepared_proof || !new_state.prepared_public_inputs.length || !new_state.proof_verifier) {
        //     throw new Error("Invalid state");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string", "uint256"],
            [new_state.current_hash, ACTION_VALIDATE_DATA_ROOT, public_input_index]
        ));


        if (is_delayed_proof) {
            // Implementation would depend on contract interactions
            // await this.verifyForcedOpening(optional_dual_tree_proof, optional_dual_tree_public_inputs);
        } else {
            // await this.has_data_stream_root(datastream, new_state.prepared_public_inputs[public_input_index]);
        }

        return new_state;
    }

    async solidity_dryrun_validate_timestamp(state: ProvingState, output_proof_index: number, output_index: number, public_input_index: number, timestamp_window: number): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunValidateTimestamp(state, output_proof_index, output_index, public_input_index, timestamp_window);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    dryrun_validate_timestamp(
        state: ProvingState,
        output_proof_index: number,
        output_index: number,
        public_input_index: number,
        timestamp_window: number
    ): ProvingState {
        const new_state = { ...state };
        // if (!new_state.prepared_proof || !new_state.prepared_public_inputs.length || !new_state.proof_verifier) {
        //     throw new Error("Invalid state");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_VALIDATE_TIMESTAMP]
        ));
        // const timestamp1 = parseInt(new_state.outputs[output_proof_index][output_index]);
        // const timestamp2 = parseInt(new_state.prepared_public_inputs[public_input_index]);
        
        // if (timestamp1 < timestamp2 - timestamp_window || timestamp1 > timestamp2 + timestamp_window) {
        //     throw new Error("Timestamp validation failed");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "uint256", "uint256", "uint256", "uint256"],
            [new_state.current_hash, output_proof_index, output_index, public_input_index, timestamp_window]
        ));

        return new_state;
    }


    async solidity_dryrun_chain_static_input(state: ProvingState, inputs: string[], indexes: number[]): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunChainStaticInput(state, inputs, indexes);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    dryrun_chain_static_input(
        state: ProvingState,
        inputs: string[],
        indexes: number[]
    ): ProvingState {
        const new_state = { ...state };
        // if (indexes.length !== inputs.length || !new_state.prepared_proof) {
        //     throw new Error("Invalid inputs");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_STATIC_INPUT]
        ));
        for (let i = 0; i < indexes.length; i++) {
            //new_state.prepared_public_inputs[indexes[i]] = inputs[i];
            new_state.current_hash = keccak256(ethers.solidityPacked(
                ["bytes32", "uint256", "bytes32"],
                [new_state.current_hash, indexes[i], inputs[i]]
            ));
        }

        return new_state;
    }

    async solidity_dryrun_chain_pass_signal(state: ProvingState, public_input_indexes: number[], output_proof_indexes: number[], output_signal_indexes: number[], dryrun_mode: boolean = false): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            return await this.chainedProofWrapper.dryrunChainPassSignal(state, public_input_indexes, output_proof_indexes, output_signal_indexes, dryrun_mode);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    dryrun_chain_pass_signal(
        state: ProvingState,
        public_input_indexes: number[],
        output_proof_indexes: number[],
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
        for (let i = 0; i < public_input_indexes.length; i++) {
            if (!dryrun_mode) {
                new_state.prepared_public_inputs[public_input_indexes[i]] = 
                    new_state.outputs[output_proof_indexes[i]][output_signal_indexes[i]];
            }
           
            new_state.current_hash = keccak256(ethers.solidityPacked(
                ["bytes32", "uint256", "uint256", "uint256"],
                [new_state.current_hash, public_input_indexes[i], output_proof_indexes[i], output_signal_indexes[i]]
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

    async dryrun_chain_proof_verify(state: ProvingState, ignore_proof: boolean): Promise<ProvingState> {
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

    async solidity_dryrun_start_proving(verifier_address: string, public_inputs: string[], proof: string, verify_proof: boolean): Promise<ProvingState> {
        if (this.chainedProofWrapper) {
            
            return await this.chainedProofWrapper.dryrunStartProving(verifier_address, public_inputs.map(input => ethers.zeroPadValue(input, 32)), proof, verify_proof);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }

    dryrun_start_proving(
        verifier_address: string,
        public_inputs: string[] = ["0x0000000000000000000000000000000000000000000000000000000000000000"],
        proof: string = ""
    ): ProvingState {
        const new_state: ProvingState = {
            current_hash: keccak256(ethers.solidityPacked(["address"], [verifier_address])),
            expected_hash: public_inputs[0],
            current_index: 0,
            outputs: [],
            prepared_public_inputs: public_inputs,
            prepared_proof: proof,
            proof_verifier: verifier_address,
            commited_processor_public_key: [
                parseInt(public_inputs[0]),
                parseInt(public_inputs[0])
            ],
            initiator: "",
        };

        return new_state;
    }
}
