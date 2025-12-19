import { ethers, keccak256, Provider } from "ethers";

// import { CircuitWrapper } from "nihilium-circuits/types/circuit_wrapper";
// import { WrappedCircuit } from "nihilium-circuits/circuit-wrapper";
// import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../../../../env_settings";
import { mimcTestCircuit, topLevelMerkleTreeCircuit, WrappedNoirCircuit, top_level_merkle_proofInputType, ProofOptions } from "@nihilium/zkp-circuits";
import { Proof, UnsealConditionProof } from "../types";
import { toPaddedHex } from "../../../utils";
import { hexToBytes } from "@noble/hashes/utils";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export class GreaterOrEqualThenProof extends UnsealConditionProof {
    //Proof ID is best some form of identifier based on the circuit and other factors
    //Must be universally unique even if the underlying circuit stays the same
   
    protected id: string = "GreaterOrEqualThen";
    protected name: string = "Greater Or Equal Then Proof";
    protected description: string = "Greater Or Equal Then Proof";
    protected version: string = "1.0.0";
    
    protected proof_input_signals: {[key: string]: [number, number]} = {
        timestamp: [0, 1], 
        threshold: [1, 1],
    }
    protected public_signals: {[key: string]: [number, number]} = {
        timestamp: [0, 1],
        threshold: [1, 1],
    }
    
    
    constructor(
        
    ) {
        super();
        
    }


    async create_proof(inputs: {[key: string]: any}): Promise<Proof> {
        if(inputs.timestamp_to_check < inputs.threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        return {
            proof: 0n,
            public_signals: [inputs.timestamp, inputs.threshold],
        }
    }

    async verify_proof(proof: Proof): Promise<boolean> {
        //TODO: Implement this
        throw new Error("Not implemented");
    }


    async verify_onchain_proof(proof: Proof): Promise<boolean> {
        //return await this.circuit.verifyOnchainProof(proof);
        return false;
    }

    async create_proof_from_signals(inputs: any[]): Promise<Proof> {
        throw new Error("Not implemented");
    }
}