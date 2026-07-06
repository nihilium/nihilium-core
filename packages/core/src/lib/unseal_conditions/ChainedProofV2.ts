import { ethers, keccak256, Signer } from "ethers";
import { ChainedProofWrapperV2 } from "../contract_wrappers/ChainedProofWrapperV2";
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


export interface ProvingStateV2 {
    current_hash: string;
    //expected_hash: string;
    current_index: number;
    verifier_must_be_true: boolean;
    outputs: string[];
    prepared_public_inputs: string[];
    prepared_proof: string;
    proof_verifier: string;
   // commited_processor_public_key: number[];
    initiator: string;
    
}

export class ChainedProofV2 {
    provingStates: Map<string, ProvingStateV2>;
    private public_proof_verifier: string;
    private forced_opening_verifier: string;
    private chainedProofWrapper?: ChainedProofWrapperV2;
    constructor(public_proof_verifier: string, forced_opening_verifier: string, provider: ethers.Provider | undefined = undefined, signer: Signer | undefined = undefined) {
        this.provingStates = new Map();
        this.public_proof_verifier = public_proof_verifier;
        this.forced_opening_verifier = forced_opening_verifier;
        if (provider) {
            this.chainedProofWrapper = new ChainedProofWrapperV2(provider, signer);
        }
    }

    async initializeSolidity(): Promise<void> {
        if (this.chainedProofWrapper) {
            await this.chainedProofWrapper.attach(this.public_proof_verifier);
        }else{
            throw new Error("ChainedProofWrapper not initialized");
        }
    }


    private async has_data_stream_root(state: ProvingStateV2, datastream: string, root: string): Promise<ProvingStateV2> {
        // Implementation would depend on DualMerkleTree contract interactio
        // n
        const new_state = { ...state };
        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string"],
            [new_state.current_hash, ACTION_VALIDATE_DATA_ROOT]
        ));
      
        return new_state;
    }


    async solidity_dryrun_prepare_next_proof(state: ProvingStateV2, verifier_address: string, verifierMustBeTrue: boolean, publicInputs: string[], proof: string): Promise<ProvingStateV2> {
        const localResult = ChainedProofV2.dryrun_prepare_next_proof(state, verifier_address, verifierMustBeTrue, publicInputs, proof);
        const localHash = ChainedProofV2.hashState(localResult);
        if (this.chainedProofWrapper) {
            const solidityHash = await this.chainedProofWrapper.dryrunPrepareNextProof(state, verifier_address, verifierMustBeTrue, publicInputs.map(input => ethers.zeroPadValue(input, 32)), proof);
            if (localHash !== solidityHash[0]) {
                throw new Error(`solidity_dryrun_prepare_next_proof hash mismatch: local=${localHash} solidity=${solidityHash[0]}`);
            }
            return localResult;
        }else{
            throw new Error("ChainedProofWrapperV2 not initialized");
        }
    }


    static dryrun_prepare_next_proof(state: ProvingStateV2, verifier_address: string, verifierMustBeTrue: boolean, publicInputs: string[], proof: string): ProvingStateV2 {
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

    async solidity_dryrun_validate_data_root(state: ProvingStateV2, datastream: string, output_signal_index: number): Promise<ProvingStateV2> {
        const localResult = await ChainedProofV2.dryrun_validate_data_root(state, datastream, output_signal_index);
        const localHash = ChainedProofV2.hashState(localResult);
        if (this.chainedProofWrapper) {
            const solidityHash = await this.chainedProofWrapper.dryrunValidateDataRoot(state, datastream, output_signal_index);
            if (localHash !== solidityHash) {
                throw new Error(`solidity_dryrun_validate_data_root hash mismatch: local=${localHash} solidity=${solidityHash[0]}`);
            }
            return localResult;
        }else{
            throw new Error("ChainedProofWrapperV2 not initialized");
        }
    }

    static async dryrun_validate_data_root(
        state: ProvingStateV2, 
        address: string,       
        
        output_signal_index: number,
        
    ): Promise<ProvingStateV2> {
        const new_state = { ...state };
        // if (!new_state.prepared_proof || !new_state.prepared_public_inputs.length || !new_state.proof_verifier) {
        //     throw new Error("Invalid state");
        // }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "string","address", "uint256"],
            [new_state.current_hash, ACTION_VALIDATE_DATA_ROOT, address, output_signal_index]
        ));


      

        return new_state;
    }




    async solidity_dryrun_chain_static_input(state: ProvingStateV2, value: bigint, public_input_index: number): Promise<ProvingStateV2> {
        const localResult = ChainedProofV2.dryrun_chain_static_input(state, value, public_input_index);
        const localHash = ChainedProofV2.hashState(localResult);
        if (this.chainedProofWrapper) {
            const solidityHash = await this.chainedProofWrapper.dryrunChainStaticInput(state, value, public_input_index);
            if (localHash !== solidityHash[0]) {
                throw new Error(`solidity_dryrun_chain_static_input hash mismatch: local=${localHash} solidity=${solidityHash[0]}`);
            }
            return localResult;
        }else{
            throw new Error("ChainedProofWrapperV2 not initialized");
        }
    }

    static dryrun_chain_static_input(
        state: ProvingStateV2,
        value: bigint,
        public_input_index: number
    ): ProvingStateV2 {
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

    async solidity_dryrun_chain_pass_signal(state: ProvingStateV2, public_input_indexes: number[], output_signal_indexes: number[], dryrun_mode: boolean = false): Promise<ProvingStateV2> {
        const localResult = ChainedProofV2.dryrun_chain_pass_signal(state, public_input_indexes, output_signal_indexes, dryrun_mode);
        const localHash = ChainedProofV2.hashState(localResult);
        if (this.chainedProofWrapper) {
            const solidityHash = await this.chainedProofWrapper.dryrunChainPassSignal(state, public_input_indexes, output_signal_indexes, dryrun_mode);
            if (localHash !== solidityHash[0]) {
                throw new Error(`solidity_dryrun_chain_pass_signal hash mismatch: local=${localHash} solidity=${solidityHash[0]}`);
            }
            return localResult;
        }else{
            throw new Error("ChainedProofWrapperV2 not initialized");
        }
    }

    static dryrun_chain_pass_signal(
        state: ProvingStateV2,
        public_input_indexes: number[],        
        output_signal_indexes: number[],
        dryrun_mode: boolean = false
    ): ProvingStateV2 {
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
                    new_state.outputs[output_signal_indexes[0] + i];
            }
           
            new_state.current_hash = keccak256(ethers.solidityPacked(
                ["bytes32", "uint256", "uint256"],
                [new_state.current_hash, public_input_indexes[0] + i, output_signal_indexes[0] + i]
            ));
        }

        return new_state;
    }

    async solidity_dryrun_chain_proof_verify(state: ProvingStateV2, output_removal_mask: bigint, ignore_proof: boolean): Promise<ProvingStateV2> {
        const localResult = await ChainedProofV2.dryrun_chain_proof_verify(state, BigInt(output_removal_mask), ignore_proof);
        const localHash = ChainedProofV2.hashState(localResult);
        if (this.chainedProofWrapper) {
            const solidityHash = await this.chainedProofWrapper.dryrunChainProofVerify(state, toPaddedHex(output_removal_mask, 32), ignore_proof);
            if (localHash !== solidityHash[0]) {
                throw new Error(`solidity_dryrun_chain_proof_verify hash mismatch: local=${localHash} solidity=${solidityHash[0]}`);
            }
            return localResult;
        }else{
            throw new Error("ChainedProofWrapperV2 not initialized");
        }
    }

    static async dryrun_chain_proof_verify(state: ProvingStateV2, output_removal_mask: BigInt, ignore_proof: boolean): Promise<ProvingStateV2> {
        const new_state = { ...state };

        if (!ignore_proof) {
            // Implementation would depend on verifier contract interaction
            // await this.verifyProof(new_state.prepared_proof, new_state.prepared_public_inputs);
        }

        new_state.current_hash = keccak256(ethers.solidityPacked(
            ["bytes32", "address", "uint256"],
            [new_state.current_hash, new_state.proof_verifier, output_removal_mask]
        ));

        // Step 1: Build combined array (existing outputs + new proof outputs)
        const oldLen = state.outputs?.length ?? 0;
        const newLen = new_state.prepared_public_inputs?.length ?? 0;
        const combinedLen = oldLen + newLen;

        // Step 2: Count kept entries and build pruned flat outputs array
        const mask = BigInt(output_removal_mask.toString());
        const pruned: string[] = [];
        for (let i = 0; i < combinedLen; i++) {
            if ((mask & (BigInt(1) << BigInt(i))) !== BigInt(0)) {
                if (i < oldLen) {
                    pruned.push(state.outputs[i]);
                } else {
                    pruned.push(new_state.prepared_public_inputs[i - oldLen]);
                }
            }
        }

        new_state.outputs = pruned;
        new_state.prepared_proof = "0x";
        new_state.prepared_public_inputs = [];

        return new_state;
    }


/**
 * Hash the entire ProvingStateV2 struct using chained keccak256.
 * Mirrors the Solidity _hashState function exactly:
 *   h = keccak256(bytes32(0), current_hash)
 *   h = keccak256(h, current_index)
 *   for each output: h = keccak256(h, output)
 *   for each prepared_public_input: h = keccak256(h, input)
 *   h = keccak256(h, prepared_proof)
 *   h = keccak256(h, verifier_must_be_true)
 *   h = keccak256(h, proof_verifier)
 *   h = keccak256(h, initiator)
 */
static hashState(state: ProvingStateV2): string {
    let h = keccak256(ethers.solidityPacked(
        ["bytes32", "bytes32"],
        ["0x0000000000000000000000000000000000000000000000000000000000000000", state.current_hash ?? "0x0000000000000000000000000000000000000000000000000000000000000000"]
    ));

    h = keccak256(ethers.solidityPacked(
        ["bytes32", "uint256"],
        [h, state.current_index ?? 0]
    ));

    // outputs array
    const outputs = state.outputs ?? [];
    for (let i = 0; i < outputs.length; i++) {
        h = keccak256(ethers.solidityPacked(
            ["bytes32", "bytes32"],
            [h, outputs[i]]
        ));
    }

    // prepared_public_inputs array
    const inputs = state.prepared_public_inputs ?? [];
    for (let i = 0; i < inputs.length; i++) {
        h = keccak256(ethers.solidityPacked(
            ["bytes32", "bytes32"],
            [h, inputs[i]]
        ));
    }

    // prepared_proof (dynamic bytes)
    h = keccak256(ethers.solidityPacked(
        ["bytes32", "bytes"],
        [h, (state.prepared_proof && state.prepared_proof !== "") ? state.prepared_proof : "0x"]
    ));

    h = keccak256(ethers.solidityPacked(
        ["bytes32", "bool"],
        [h, state.verifier_must_be_true ?? false]
    ));

    h = keccak256(ethers.solidityPacked(
        ["bytes32", "address"],
        [h, state.proof_verifier ?? ethers.ZeroAddress]
    ));

    h = keccak256(ethers.solidityPacked(
        ["bytes32", "address"],
        [h, state.initiator ?? ethers.ZeroAddress]
    ));

    return h;
}

static async calculateUnsealRoot(unseal_proof_actions: UnsealProofAction[]): Promise<string> {
    var proof_counter = 0;
    var proof_state: any | ProvingStateV2 = {};
    for(var action of unseal_proof_actions) {      
        // if(action.action === ACTION_START_UNSEALING) {
        //     proof_state = await this.chainedProof.dryrun_start_proving(action.params.verifier_address, dryrun ? [] : public_inputs[proof_counter], dryrun ? [] : proofs[proof_counter])
        //     proof_counter++;
        // }
        if(action.action === ACTION_PREPARE_NEXT_PROOF) {
            proof_state = await ChainedProofV2.dryrun_prepare_next_proof(proof_state,
                 action.params.verifier_address, 
                 action.params.verifier_must_be_true,
                 [] , "0x")
            proof_counter++;
        }
        if(action.action === ACTION_CHAIN_PROOF_VERIFY) {
            proof_state = await ChainedProofV2.dryrun_chain_proof_verify(
                proof_state, action.params.mask, true)
        }
        if(action.action === ACTION_PASS_SIGNAL) {
            proof_state = await ChainedProofV2.dryrun_chain_pass_signal(proof_state, 
                action.params.public_input_indexes,                 
                action.params.output_signal_indexes, true)
        }
        if(action.action === ACTION_STATIC_INPUT) {
            proof_state = await ChainedProofV2.dryrun_chain_static_input(proof_state,
                action.params.value,
                action.params.public_input_index)
        }
        if(action.action === ACTION_VALIDATE_DATA_ROOT) {
            proof_state = await ChainedProofV2.dryrun_validate_data_root(
                proof_state,                     
                action.params.address, 
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
