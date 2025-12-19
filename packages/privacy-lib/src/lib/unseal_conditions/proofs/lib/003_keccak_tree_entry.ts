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
export class KeccakTreeEntryProof extends UnsealConditionProof {
    //Proof ID is best some form of identifier based on the circuit and other factors
    //Must be universally unique even if the underlying circuit stays the same
   
    protected id: string = "KeccakTreeEntry";
    protected name: string = "Keccak Tree Entry Proof";
    protected description: string = "Keccak Tree Entry Proof";
    protected version: string = "1.0.0";
    
    protected proof_input_signals: {[key: string]: [number, number]} = {
        reveal_value: [0, 1], //Can be any length of data
    }
    protected public_signals: {[key: string]: [number, number]} = {
        reveal_value: [0, 1],
        tree_entry: [1, 1],
    }
    
    
    constructor(
        
    ) {
        super();
        
    }


    async create_proof(inputs: {[key: string]: any}): Promise<Proof> {
        
        return {
            proof: 0n,
            public_signals: [inputs.reveal_value, keccak256(toPaddedHex(BigInt(inputs.reveal_value)) + toPaddedHex(0n)).slice(2)],
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