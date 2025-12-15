import { ethers, Provider } from "ethers";
import { CircuitInput, ProofMode, CircuitOutput, ChainedInputSuggestion, ChainableProofDefinition } from "./types";
//import { CircuitWrapper } from "nihilium-circuits/types/circuit_wrapper";
//import { WrappedCircuit } from "nihilium-circuits/circuit-wrapper";
//import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../../../../env_settings";
import { subTreeMerkleTreeCircuit, sub_tree_merkle_proofInputType, topLevelMerkleTreeCircuit, WrappedNoirCircuit, top_level_merkle_proofInputType, ProofOptions } from "@nihilium/zkp-circuits";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export class SubTreeProof implements ChainableProofDefinition<sub_tree_merkle_proofInputType> {
    //Proof ID is best some form of identifier based on the circuit and other factors
    //Must be universally unique even if the underlying circuit stays the same
    private proofId: string = "0x0000000000000000000000000000000000000000000000000000000000000001";
    private mode: ProofMode;
    private address: string;
    private provider: Provider | null;
    private circuit: WrappedNoirCircuit<sub_tree_merkle_proofInputType>;
    private suggested_static_inputs: CircuitInput[] = [
        {name: "leaf_value", index_range: [0, 1], type: "Field"},
        {name: "root", index_range: [1, 1], type: "Field"},
        {name: "path", index_range: [2, 20], type: "Array"},
        {name: "index_bits", index_range: [23, 20], type: "Array"}
    ];
    //(computed_root, leaf_value, bits_to_index(index_bits))
    private outputs: CircuitOutput[] = [
        {name: "computed_root", index_range: [0, 1], type: "Field"},
        {name: "leaf_value", index_range: [1, 1], type: "Field"},
        {name: "index", index_range: [2, 1], type: "Field"}
    ];
    private suggested_chained_inputs: ChainedInputSuggestion[] = [
        
    ];
    private suggested_chained_proofs: string[] = [];
    constructor(
        address: string,
        provider: Provider | null = null,
        mode: ProofMode = ProofMode.CREATE_REVEAL_ROOT,
    ) {
        this.mode = mode;
        this.address = address;
        this.provider = provider;
        this.circuit = subTreeMerkleTreeCircuit;
        
    }

    get_id(): string {
        return this.proofId;
    }

    get_description(): string {
        return "Sub Tree Proof";
    }

    get_inputs(): CircuitInput[] {
        return this.suggested_static_inputs;
    }

    get_input_index(name: string): [number, number] {
        return this.suggested_static_inputs.find(input => input.name === name)?.index_range || [-1, 0];
    }
    get_output_index(name: string): [number, number] {
        return this.outputs.find(output => output.name === name)?.index_range || [-1, 0];
    }

    get_outputs(): CircuitOutput[] {
        return this.outputs;
    }

    get_suggested_chained_inputs(): ChainedInputSuggestion[] {
        return this.suggested_chained_inputs;
    }

    async create_proof(inputs: sub_tree_merkle_proofInputType): Promise<any> {
        await this.circuit.init()
        return await this.circuit.generateProof({input: inputs});
    }

    async verify_proof(proof: any, public_signals: any[]): Promise<boolean> {
        //TODO: Implement this
        await this.circuit.init()
        return await this.circuit.verifyProof(proof);
    }

    async verify_onchain_proof(proof: any, public_signals: any[]): Promise<boolean> {
        //return await this.circuit.verifyOnchainProof(proof);
        return false;
    }
}