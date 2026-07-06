import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PREPARE_NEXT_PROOF } from "../ChainedProof";
import { AddressMap } from "../collections/types";
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
    /**
     * 
     * @description The complexity score of the proof. Essentially the gas cost of the proof.
     * Be generous when setting this score! A score too low will result a proof being unchallangable
     *
     * @default 250_000 General gasscost of a ZKProof
     
     */
    complexity_score: number;
}


export class UnsealConditionProof {
    public data: UnsealConditionProofData;
   
    constructor(data: UnsealConditionProofData) {
        this.data = data;
    }

    getOutputSize(): number {
        return Object.values(this.data.public_signals).reduce((acc, curr) => acc + curr[1], 0);
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
    compile(addresses: AddressMap, verifier_must_be_true: boolean = true): CompiledProof {
        if(!addresses.getAddress(this.data.addressMapKey)) {
            throw new Error("Address not found for proof " + this.data.name);
        }
        return {
            prepare_action: {
                action: ACTION_PREPARE_NEXT_PROOF,
                params: {
                    verifier_address: addresses.getAddress(this.data.addressMapKey),
                    verifier_must_be_true: verifier_must_be_true,
                },
            },
            validate_action: {
                action: ACTION_CHAIN_PROOF_VERIFY,
                params: {
                    verifier_address: addresses.getAddress(this.data.addressMapKey),
                },
            },
        }
    }
   
}

export type CompiledProof = {
    prepare_action: UnsealProofAction;
    validate_action: UnsealProofAction;
}