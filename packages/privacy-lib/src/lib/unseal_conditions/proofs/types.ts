import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PREPARE_NEXT_PROOF } from "../ChainedProof";
import { UnsealProofAction } from "../types";

export type Proof = {
    proof: any;
    public_signals: any[];
}

export abstract class UnsealConditionProof {
    protected id: string = "";
    protected name: string = "";
    protected description: string = "";
    // protected addresses: {[key: string]: string} = {}; //chainID: address
    protected version: string = "";
    protected proof_input_signals: {[key: string]: [number, number]} = {}; //index_range
    protected public_signals: {[key: string]: [number, number]} = {}; //index_range
    protected total_signal_length: number = 0;
   
    getId(): string {
        return this.id;
    }
    getProofInputSignalIndex(signal: string): [number, number] {
        return this.proof_input_signals[signal];
    }
    getProofInputSignals(): {[key: string]: [number, number]} {
        return this.proof_input_signals;
    }
    getProofInputSignalKeys(): string[] {
        return Object.keys(this.proof_input_signals);
    }
    getSignalIndex(signal: string): [number, number] {
        return this.public_signals[signal];
    }
    getPublicSignals(): {[key: string]: [number, number]}  {
        return this.public_signals;
    }
    getSignalLength(): number {
        //Compute this in the constructor
        return this.total_signal_length;
    }
    // getAddress(chainID: string): string {
    //     return this.addresses[chainID];
    // }
    getVersion(): string {
        return this.version;
    }
    getDescription(): string {
        return this.description;
    }
    getName(): string {
        return this.name;
    }
    compile(addresses: {[key: string]: string}): CompiledProof {
        if(!addresses[this.id]) {
            throw new Error("Address not found for proof " + this.id);
        }
        return {
            prepare_action: {
                action: ACTION_PREPARE_NEXT_PROOF,
                params: {
                    verifier_address: addresses[this.id],
                },
            },
            validate_action: {
                action: ACTION_CHAIN_PROOF_VERIFY,
                params: {
                    verifier_address: addresses[this.id],
                },
            },
        }
    }
    abstract create_proof_from_signals(inputs: any[]): Promise<Proof>;
    abstract create_proof(inputs: {[key: string]: any}): Promise<Proof>;
    abstract verify_proof(proof: Proof): Promise<boolean>;
    abstract verify_onchain_proof(proof: Proof): Promise<boolean>;
}

export type CompiledProof = {
    prepare_action: UnsealProofAction;
    validate_action: UnsealProofAction;
}