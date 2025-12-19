import { ethers, Provider } from "ethers";

//import { CircuitWrapper } from "nihilium-circuits/types/circuit_wrapper";
//import { WrappedCircuit } from "nihilium-circuits/circuit-wrapper";
//import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../../../../env_settings";
import { subTreeMerkleTreeCircuit, sub_tree_merkle_proofInputType, WrappedNoirCircuit } from "@nihilium/zkp-circuits";
import { Proof, UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export class SubTreeProof extends UnsealConditionProof {
    //Proof ID is best some form of identifier based on the circuit and other factors
    //Must be universally unique even if the underlying circuit stays the same
    protected id: string = "SubTreeMerkleProof";
    
    protected name: string = "Sub Tree Proof";
    protected description: string = "Sub Tree Proof";
    protected version: string = "1.0.0";
    private circuit: WrappedNoirCircuit<sub_tree_merkle_proofInputType>;
    protected proof_input_signals: {[key: string]: [number, number]} = {
        leaf_value: [0, 1],
        root: [1, 1],
        path: [2, 20],
        index_bits: [23, 20],
    }
    //(computed_root, leaf_value, bits_to_index(index_bits))
    protected public_signals: {[key: string]: [number, number]} = {
        computed_root: [0, 1],
        leaf_value: [1, 1],
        index: [2, 1],
    }
    constructor() {
        super();
        this.circuit = subTreeMerkleTreeCircuit;
    }
    




    async create_proof(inputs: {[key: string]: any}): Promise<Proof> {
        await this.circuit.init()
        var result = await this.circuit.generateProof({input: inputs as unknown as sub_tree_merkle_proofInputType});
        if (!result) {
            throw new Error("Failed to generate proof");
        }
        return {
            proof: result.proof,
            public_signals: result.publicSignals,
        }
    }

    async verify_proof(proof: Proof): Promise<boolean> {
        //TODO: Implement this
        await this.circuit.init()
        return await this.circuit.verifyProof({proof: proof.proof, publicSignals: proof.public_signals});
    }

    async create_proof_from_signals(inputs: any[]): Promise<Proof> {
        throw new Error("Not implemented");
    }

    async verify_onchain_proof(proof: Proof): Promise<boolean> {
        //return await this.circuit.verifyOnchainProof(proof);
        return false;
    }
}