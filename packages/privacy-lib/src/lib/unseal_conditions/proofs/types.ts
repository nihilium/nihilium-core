import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PREPARE_NEXT_PROOF } from "../ChainedProof";
import { UnsealProofAction } from "../types";

export type Proof = {
    proof: any;
    public_signals: any[];
}

export type UnsealConditionProofData = {
   // id: string;
    name: string;
    addressMapKey: string;
    description?: string;
    version: string;
    public_signals: {[key: string]: [number, number]};
    complexity_hint?: number;
}


export class UnsealConditionProof {
    public data: UnsealConditionProofData;
   
    constructor(data: UnsealConditionProofData) {
        this.data = data;
    }
   
    getSignalIndex(signal: string): [number, number] {
        return this.data.public_signals[signal];
    }
    getPublicSignals(): {[key: string]: [number, number]}  {
        return this.data.public_signals;
    }
 
    getVersion(): string {
        return this.data.version;
    }
    getDescription(): string {
        return this.data.description || "";
    }
    getName(): string {
        return this.data.name;
    }
    compile(addresses: {[key: string]: string}): CompiledProof {
        if(!addresses[this.data.addressMapKey]) {
            throw new Error("Address not found for proof " + this.data.name);
        }
        return {
            prepare_action: {
                action: ACTION_PREPARE_NEXT_PROOF,
                params: {
                    verifier_address: addresses[this.data.addressMapKey],
                    verifier_must_be_true: true,
                },
            },
            validate_action: {
                action: ACTION_CHAIN_PROOF_VERIFY,
                params: {
                    verifier_address: addresses[this.data.addressMapKey],
                },
            },
        }
    }
   
}

export type CompiledProof = {
    prepare_action: UnsealProofAction;
    validate_action: UnsealProofAction;
}