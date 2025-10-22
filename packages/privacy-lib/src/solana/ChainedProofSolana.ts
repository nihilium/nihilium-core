import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { keccak256 } from "ethers";
import { ProvingState } from "../lib/reveal_methods/base_functions/ChainedProof";

// Re-export ProvingState for external use
export { ProvingState };

export const ACTION_START_UNSEALING = "start_unsealing";
export const ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
export const ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";
export const ACTION_STATIC_INPUT = "static_input";
export const ACTION_PASS_SIGNAL = "pass_signal";
export const ACTION_PASS_SIGNAL_PLUSONE = "pass_signal_plusone";
export const ACTION_VALIDATE_TIMESTAMP = "validate_timestamp";
export const ACTION_VALIDATE_DATA_ROOT = "validate_data_root";

export interface ProvingStateSolana {
    current_hash: number[];
    expected_hash: number[];
    current_index: number;
    outputs: { values: number[][] }[];
    prepared_public_inputs: number[][];
    prepared_proof: number[];
    proof_verifier: number[];
    commited_processor_public_key: number[];
    initiator: number[];
}

export class ChainedProofSolana {
    private program: Program;
    private provider: AnchorProvider;
    private chainedProofPDA: PublicKey;
    private public_proof_verifier: PublicKey;
    private forced_opening_verifier: PublicKey;

    constructor(
        program: Program,
        provider: AnchorProvider,
        chainedProofPDA: PublicKey,
        public_proof_verifier: PublicKey,
        forced_opening_verifier: PublicKey
    ) {
        this.program = program;
        this.provider = provider;
        this.chainedProofPDA = chainedProofPDA;
        this.public_proof_verifier = public_proof_verifier;
        this.forced_opening_verifier = forced_opening_verifier;
    }

    async isInitialized(): Promise<boolean> {
        try {
            // Check if the account exists by trying to fetch it
            // Since the IDL might not have account types defined, we'll use a direct RPC call
            const accountInfo = await this.provider.connection.getAccountInfo(this.chainedProofPDA);
            return accountInfo !== null;
        } catch (error) {
            console.log("Error checking if initialized:", error);
            return false;
        }
    }

    async initialize(): Promise<void> {
        // Check if already initialized
        if (await this.isInitialized()) {
            console.log("ChainedProof already initialized, skipping initialization");
            return;
        }

        const tx = await this.program.methods
            .initializeChainedProof(this.public_proof_verifier, this.forced_opening_verifier)
            .accounts({
                chainedProof: this.chainedProofPDA,
                payer: this.provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .simulate();
        
        console.log("ChainedProof initialized:", tx);
    }

    private convertProvingStateToSolana(state: ProvingState): ProvingStateSolana {
        return {
            current_hash: Array.from(Buffer.from(state.current_hash.slice(2), 'hex')),
            expected_hash: Array.from(Buffer.from(state.expected_hash.slice(2), 'hex')),
            current_index: state.current_index,
            outputs: state.outputs.map(output => ({
                values: output.map(item => Array.from(Buffer.from(item.slice(2), 'hex')))
            })),
            prepared_public_inputs: state.prepared_public_inputs.map(input => 
                Array.from(Buffer.from(input.slice(2), 'hex'))
            ),
            prepared_proof: Array.from(Buffer.from(state.prepared_proof.slice(2), 'hex')),
            proof_verifier: Array.from(Buffer.from(state.proof_verifier.slice(2), 'hex')),
            commited_processor_public_key: state.commited_processor_public_key,
            initiator: Array.from(Buffer.from(state.initiator.slice(2), 'hex')),
        };
    }

    private convertProvingStateFromSolana(state: any): ProvingState {
        return {
            current_hash: '0x' + Buffer.from(state.currentHash).toString('hex'),
            expected_hash: '0x' + Buffer.from(state.expectedHash).toString('hex'),
            current_index: state.currentIndex,
            outputs: state.outputs.map((output: any) => 
                output.values.map((item: any) => '0x' + Buffer.from(item).toString('hex'))
            ),
            prepared_public_inputs: state.preparedPublicInputs.map((input: any) => 
                '0x' + Buffer.from(input).toString('hex')
            ),
            prepared_proof: '0x' + Buffer.from(state.preparedProof).toString('hex'),
            proof_verifier: '0x' + state.proofVerifier.toString(),
            commited_processor_public_key: state.commitedProcessorPublicKey,
            initiator: '0x' + state.initiator.toString(),
        };
    }

    async dryrun_prepare_next_proof(
        state: ProvingState,
        verifier: PublicKey,
        publicInputs: string[],
        proof: string
    ): Promise<ProvingState> {
        const publicInputsBytes = publicInputs.map(input => 
            new Uint8Array(Buffer.from(input.slice(2), 'hex'))
        );
        const proofBytes = new Uint8Array(Buffer.from(proof.slice(2), 'hex'));
        
        const solanaState = this.convertProvingStateToSolana(state);
        
        const result = await this.program.methods
            .dryrunPrepareNextProof(
                solanaState.current_hash,
                solanaState.expected_hash,
                new BN(solanaState.current_index),
                solanaState.outputs,
                solanaState.prepared_public_inputs,
                solanaState.prepared_proof,
                new PublicKey(solanaState.proof_verifier),
                solanaState.commited_processor_public_key,
                new PublicKey(solanaState.initiator),
                verifier,
                publicInputsBytes,
                proofBytes
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
            })
            .simulate();
        
        return this.convertProvingStateFromSolana(result);
    }

    async dryrun_validate_data_root(
        state: ProvingState,
        datastream: PublicKey,
        public_input_index: number,
        is_delayed_proof: boolean,
        optional_dual_tree_proof: string,
        optional_dual_tree_public_inputs: string[],
        merkle_root_index: number
    ): Promise<ProvingState> {
        const solanaState = this.convertProvingStateToSolana(state);
        const proofBytes = new Uint8Array(Buffer.from(optional_dual_tree_proof.slice(2), 'hex'));
        const publicInputsBytes = optional_dual_tree_public_inputs.map(input => 
            new Uint8Array(Buffer.from(input.slice(2), 'hex'))
        );
        
        const result = await this.program.methods
            .dryrunValidateDataRoot(
                solanaState.current_hash,
                solanaState.expected_hash,
                new BN(solanaState.current_index),
                solanaState.outputs,
                solanaState.prepared_public_inputs,
                solanaState.prepared_proof,
                new PublicKey(solanaState.proof_verifier),
                solanaState.commited_processor_public_key,
                new PublicKey(solanaState.initiator),
                datastream,
                new BN(public_input_index),
                is_delayed_proof,
                proofBytes,
                publicInputsBytes,
                new BN(merkle_root_index)
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
                datastream: datastream,
            })
            .simulate();
        
        return this.convertProvingStateFromSolana(result);
    }

    async dryrun_validate_timestamp(
        state: ProvingState,
        output_proof_index: number,
        output_index: number,
        public_input_index: number,
        timestamp_window: number
    ): Promise<ProvingState> {
        const solanaState = this.convertProvingStateToSolana(state);
        
        const result = await this.program.methods
            .dryrunValidateTimestamp(
                solanaState.current_hash,
                solanaState.expected_hash,
                new BN(solanaState.current_index),
                solanaState.outputs,
                solanaState.prepared_public_inputs,
                solanaState.prepared_proof,
                new PublicKey(solanaState.proof_verifier),
                solanaState.commited_processor_public_key,
                new PublicKey(solanaState.initiator),
                new BN(output_proof_index),
                new BN(output_index),
                new BN(public_input_index),
                new BN(timestamp_window)
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
            })
            .simulate();
        
        return this.convertProvingStateFromSolana(result);
    }

    async dryrun_chain_static_input(
        state: ProvingState,
        inputs: string[],
        indexes: number[]
    ): Promise<ProvingState> {
        const solanaState = this.convertProvingStateToSolana(state);
        const inputsBytes = inputs.map(input => 
            new Uint8Array(Buffer.from(input.slice(2), 'hex'))
        );
        
        const result = await this.program.methods
            .dryrunChainStaticInput(
                solanaState.current_hash,
                inputsBytes,
                indexes.map(i => new BN(i))
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
            })
            .simulate();
        
        // For this function, we need to manually update the state since it returns a hash
        const newState = { ...state };
        newState.current_hash = '0x' + Buffer.from(result).toString('hex');
        return newState;
    }

    async dryrun_chain_pass_signal(
        state: ProvingState,
        public_input_indexes: number[],
        output_proof_indexes: number[],
        output_indexes: number[]
    ): Promise<ProvingState> {
        const solanaState = this.convertProvingStateToSolana(state);
        
        const result = await this.program.methods
            .dryrunChainPassSignal(
                solanaState.current_hash,
                public_input_indexes.map(i => new BN(i)),
                output_proof_indexes.map(i => new BN(i)),
                output_indexes.map(i => new BN(i))
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
            })
            .simulate();
        
        // Update the state with the new hash
        const newState = { ...state };
        newState.current_hash = '0x' + Buffer.from(result).toString('hex');
        return newState;
    }

    async dryrun_chain_proof_verify(
        state: ProvingState,
        ignore_proof: boolean
    ): Promise<ProvingState> {
        const solanaState = this.convertProvingStateToSolana(state);
        
        const result = await this.program.methods
            .dryrunChainProofVerify(
                solanaState.current_hash,
                new PublicKey(solanaState.proof_verifier),
                ignore_proof
            )
            .accounts({
                chainedProof: this.chainedProofPDA,
                verifier: new PublicKey(solanaState.proof_verifier),
            })
            .simulate();
        
        // Update the state with the new hash
        const newState = { ...state };
        newState.current_hash = '0x' + Buffer.from(result).toString('hex');
        return newState;
    }

    async dryrun_start_proving(
        verifier: PublicKey,
        public_inputs: string[],
        proof: string,
        verify_proof: boolean
    ): Promise<ProvingState> {
        const publicInputsBytes = public_inputs.map(input => {
            const bytes = Buffer.from(input.slice(2), 'hex');
            if (bytes.length !== 32) {
                throw new Error(`Public input must be 32 bytes, got ${bytes.length}`);
            }
            return bytes;
        });
        const proofBytes = Buffer.from(proof.slice(2), 'hex');
        
        const result = await this.program.methods
            .dryrunStartProving(verifier, publicInputsBytes, proofBytes, verify_proof)
            .accounts({
                chainedProof: this.chainedProofPDA,
                verifier: verifier,
            })
            .view();
        
        console.log("Result from dryrunStartProving:", result);
        console.log("Result keys:", Object.keys(result));
        console.log("Result current_hash:", result.current_hash);
        
        return this.convertProvingStateFromSolana(result);
    }

    // Local implementation for comparison (similar to original ChainedProof.ts)
    dryrun_prepare_next_proof_local(
        state: ProvingState,
        verifier: PublicKey,
        publicInputs: string[],
        proof: string
    ): ProvingState {
        const new_state = { ...state };
        
        // Hash the current state with the verifier
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            verifier.toBuffer()
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        new_state.prepared_public_inputs = publicInputs;
        new_state.prepared_proof = proof;
        new_state.proof_verifier = verifier.toString();
        
        return new_state;
    }

    dryrun_validate_data_root_local(
        state: ProvingState,
        public_input_index: number
    ): ProvingState {
        const new_state = { ...state };
        
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            Buffer.from(ACTION_VALIDATE_DATA_ROOT),
            Buffer.from(new BN(public_input_index).toArray('le', 8))
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        
        return new_state;
    }

    dryrun_validate_timestamp_local(
        state: ProvingState,
        output_proof_index: number,
        output_index: number,
        public_input_index: number,
        timestamp_window: number
    ): ProvingState {
        const new_state = { ...state };
        
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            Buffer.from(ACTION_VALIDATE_TIMESTAMP)
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        
        // Validate timestamp window
        if (new_state.outputs.length > output_proof_index && 
            new_state.outputs[output_proof_index].length > output_index &&
            new_state.prepared_public_inputs.length > public_input_index) {
            
            const timestamp1 = new BN(new_state.outputs[output_proof_index][output_index]);
            const timestamp2 = new BN(new_state.prepared_public_inputs[public_input_index]);
            
            if (timestamp1.lt(timestamp2.sub(new BN(timestamp_window))) || 
                timestamp1.gt(timestamp2.add(new BN(timestamp_window)))) {
                throw new Error("Timestamp validation failed");
            }
        }
        
        const hashInput2 = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            Buffer.from(new BN(output_proof_index).toArray('le', 8)),
            Buffer.from(new BN(output_index).toArray('le', 8)),
            Buffer.from(new BN(public_input_index).toArray('le', 8)),
            Buffer.from(new BN(timestamp_window).toArray('le', 8))
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput2).slice(2), 'hex').toString('hex');
        
        return new_state;
    }

    dryrun_chain_static_input_local(
        state: ProvingState,
        inputs: string[],
        indexes: number[]
    ): ProvingState {
        const new_state = { ...state };
        
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            Buffer.from(ACTION_STATIC_INPUT)
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        
        for (let i = 0; i < indexes.length; i++) {
            if (indexes[i] < new_state.prepared_public_inputs.length) {
                new_state.prepared_public_inputs[indexes[i]] = inputs[i];
            }
            
            const hashInput2 = Buffer.concat([
                Buffer.from(new_state.current_hash.slice(2), 'hex'),
                Buffer.from(new BN(indexes[i]).toArray('le', 8)),
                Buffer.from(inputs[i].slice(2), 'hex')
            ]);
            
            new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput2).slice(2), 'hex').toString('hex');
        }
        
        return new_state;
    }

    dryrun_chain_pass_signal_local(
        state: ProvingState,
        public_input_indexes: number[],
        output_proof_indexes: number[],
        output_indexes: number[]
    ): ProvingState {
        const new_state = { ...state };
        
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            Buffer.from(ACTION_PASS_SIGNAL)
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        
        for (let i = 0; i < public_input_indexes.length; i++) {
            const public_input_index = public_input_indexes[i];
            const output_proof_index = output_proof_indexes[i];
            const output_index = output_indexes[i];
            
            if (output_proof_index < new_state.outputs.length && 
                output_index < new_state.outputs[output_proof_index].length &&
                public_input_index < new_state.prepared_public_inputs.length) {
                
                new_state.prepared_public_inputs[public_input_index] = 
                    new_state.outputs[output_proof_index][output_index];
            }
            
            const hashInput2 = Buffer.concat([
                Buffer.from(new_state.current_hash.slice(2), 'hex'),
                Buffer.from(new BN(public_input_indexes[i]).toArray('le', 8)),
                Buffer.from(new BN(output_proof_indexes[i]).toArray('le', 8)),
                Buffer.from(new BN(output_indexes[i]).toArray('le', 8))
            ]);
            
            new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput2).slice(2), 'hex').toString('hex');
        }
        
        return new_state;
    }

    dryrun_chain_proof_verify_local(
        state: ProvingState,
        ignore_proof: boolean
    ): ProvingState {
        const new_state = { ...state };
        
        if (!ignore_proof) {
            // In a real implementation, you would call the verifier here
        }
        
        const hashInput = Buffer.concat([
            Buffer.from(new_state.current_hash.slice(2), 'hex'),
            new PublicKey(new_state.proof_verifier).toBuffer()
        ]);
        
        new_state.current_hash = '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex');
        
        // Add outputs
        new_state.outputs.push([...new_state.prepared_public_inputs]);
        
        // Clear prepared data
        new_state.prepared_proof = "";
        new_state.prepared_public_inputs = [];
        
        return new_state;
    }

    dryrun_start_proving_local(
        verifier: PublicKey,
        public_inputs: string[],
        proof: string
    ): ProvingState {
        const hashInput = verifier.toBuffer();
        
        const state: ProvingState = {
            current_hash: '0x' + Buffer.from(keccak256(hashInput).slice(2), 'hex').toString('hex'),
            expected_hash: public_inputs[0],
            current_index: 0,
            outputs: [public_inputs],
            prepared_public_inputs: public_inputs,
            prepared_proof: proof,
            proof_verifier: verifier.toString(),
            commited_processor_public_key: [
                1234567890, // Use fixed small numbers for testing
                9876543210,
            ],
            initiator: PublicKey.default.toString(),
        };
        
        return state;
    }
}
