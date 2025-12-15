import { ethers, Provider } from "ethers";
// import { CircuitInput} from "@nihilium/zkp-circuits";
// import { CircuitWrapper } from "@nihilium/circom-circuits/types/circuit_wrapper";
// import { WrappedCircuit } from "@nihilium/circom-circuits/circuit-wrapper";
// import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../../../../env_settings";
import { validatedSigHeAddCircuit, WrappedNoirCircuit, top_level_merkle_proofInputType, ProofOptions, validated_sig_he_addInputType } from "@nihilium/zkp-circuits";
import { Proof, UnsealConditionProof } from "../types";

// export type UnsealOpeningProofInputType = {
//     Ax: bigint;
//     Ay: bigint;
//     S: bigint;
//     R8x: bigint;
//     R8y: bigint;
//     publicKey: bigint[];
//     nonceKey_add: bigint[];
//     point_org: bigint[];
//     ephemeralKey_org: bigint[];
//     severed_commit_preimage: bigint;
//     severed_random_value: bigint;
//     unseal_condition_root: bigint;
//     input_add: bigint;
//     corresponding_public_key: bigint[];
// };

/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export class UnsealOpeningProof extends UnsealConditionProof {
    //Proof ID is best some form of identifier based on the circuit and other factors
    //Must be universally unique even if the underlying circuit stays the same
    
    protected addresses: {[key: string]: string};
    private provider: Provider | null;
    protected name: string = "UnsealOpeningProof";
    protected description: string = "The base opening proof for everything Nihilium.";
    protected version: string = "1.0.0";
    private circuit: WrappedNoirCircuit<validated_sig_he_addInputType> | null;
    protected id: string = "UnsealOpeningProof";
    protected proof_input_signals: {[key: string]: [number, number]} = {
        Ax: [0, 1],
        Ay: [1, 1],
        S: [2, 1],
        R8x: [3, 1],
        R8y: [4, 1],
        publicKey: [5, 2],
        nonceKey_add: [7, 8],
        point_org: [13, 16],
        ephemeralKey_org: [29, 16],
        severed_commit_preimage: [45, 1],
        severed_random_value: [46, 1],
        unseal_condition_root: [47, 1],
        input_add: [48, 1],
        corresponding_public_key: [49, 2],
    }
    /*
   {name: "Ax", index_range: [0, 1], type: "Field"},
        {name: "Ay", index_range: [1, 1], type: "Field"},
        {name: "S", index_range: [2, 1], type: "Field"},
        {name: "R8x", index_range: [3, 1], type: "Field"},
        {name: "R8y", index_range: [4, 1], type: "Field"},
        {name: "publicKey", index_range: [5, 2], type: "Array"},
        {name: "nonceKey_add", index_range: [7, 8], type: "Array"},
        {name: "point_org", index_range: [13, 16], type: "Array"},
        {name: "ephemeralKey_org", index_range: [29, 16], type: "Array"},
        {name: "severed_commit_preimage", index_range: [45, 1], type: "Field"},
        {name: "severed_random_value", index_range: [46, 1], type: "Field"},
        {name: "unseal_condition_root", index_range: [47, 1], type: "Field"},
        {name: "input_add", index_range: [48, 1], type: "Field"},
        {name: "corresponding_public_key", index_range: [49, 2], type: "Array"},


    */

    protected public_signals: {[key: string]: [number, number]} = {
        reveal_value: [0, 1],
        unseal_condition_root_commit: [1, 1],
        metadata_root_hash: [2, 1],
        ephemeralKey_he: [3, 16],
        point_he: [19, 16],
        publicKey_validated: [35, 2],
        publicKeyHe_validated: [37, 2],
        newCombinedPublicKey: [39, 2],
    }
    //private total_signal_length: number = Object.values(this.public_signals).reduce((acc: number, signal: [number, number]) => acc + (signal[1] - signal[0]), 0);
        // {name: "reveal_value", index_range: [0, 1], type: "Field"},
        // {name: "unseal_condition_root_commit", index_range: [1, 1], type: "Field"},
        // {name: "metadata_root_hash", index_range: [2, 1], type: "Field"},
        // {name: "ephemeralKey_he", index_range: [3, 16], type: "Array"},
        // {name: "point_he", index_range: [19, 16], type: "Array"},
        // {name: "publicKey_validated", index_range: [35, 2], type: "Array"},
        // {name: "publicKeyHe_validated", index_range: [37, 2], type: "Array"},
        // {name: "newCombinedPublicKey", index_range: [39, 2], type: "Array"},
        


        // {name: "ephemeralKey_he", index_range: [0, 16], type: "Field"},
        // {name: "point_he", index_range: [16, 16], type: "Field"},
        // {name: "publicKey_validated", index_range: [32, 2], type: "Field"},
        // {name: "publicKeyHe_validated", index_range: [34, 2], type: "Field"},
        // {name: "newCombinedPublicKey", index_range: [36, 2], type: "Field"},
        // {name: "reveal_value", index_range: [38, 1], type: "Field"},
        // {name: "unseal_condition_root_commit", index_range: [39, 1], type: "Field"},
        // {name: "metadata_root_commit", index_range: [40, 1], type: "Field"},
    
    
    
    constructor(
        
        provider: Provider | null = null,
        // addresses: {[key: string]: string} = {},
        
    ) {
        super()
        
        this.addresses = {};
        this.provider = provider;
        this.circuit = validatedSigHeAddCircuit
        
        
    }
    async initialize(): Promise<void> {
        await this.circuit?.init()
       // this.circuit = await circuit_KEY_HE_ADD();
    }





    async create_proof(inputs: {[key: string]: any}): Promise<Proof> {
        var circuit_input = inputs as unknown as validated_sig_he_addInputType;
        var result = await this.circuit?.generateProof({input: circuit_input});
        if (!result) {
            throw new Error("Failed to generate proof");
        }
        return {
            proof: result.proof,
            public_signals: result.publicSignals,
        }
    }


    async create_proof_from_signals(inputs: any[]): Promise<Proof> {
        throw new Error("Not implemented");
    }

    async verify_proof(proof: Proof): Promise<boolean> {
        //TODO: Implement this
        return await this.circuit?.verifyProof({proof: proof.proof, publicSignals: proof.public_signals}) || false;
    }

    async verify_onchain_proof(proof: Proof): Promise<boolean> {
        //return await this.circuit.verifyOnchainProof(proof);
        return false;
    }
}