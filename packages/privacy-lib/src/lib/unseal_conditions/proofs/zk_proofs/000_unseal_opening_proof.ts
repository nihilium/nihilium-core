// import { ethers, Provider } from "ethers";
// import { CircuitInput, ProofMode, CircuitOutput, ChainedInputSuggestion, ChainableProofDefinition } from "./types";
// // import { CircuitWrapper } from "@nihilium/circom-circuits/types/circuit_wrapper";
// // import { WrappedCircuit } from "@nihilium/circom-circuits/circuit-wrapper";
// // import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../../../../env_settings";
// // import { validatedSigHeAddCircuit, WrappedNoirCircuit, top_level_merkle_proofInputType, ProofOptions, validated_sig_he_addInputType } from "@nihilium/zkp-circuits";

// // export type UnsealOpeningProofInputType = {
// //     Ax: bigint;
// //     Ay: bigint;
// //     S: bigint;
// //     R8x: bigint;
// //     R8y: bigint;
// //     publicKey: bigint[];
// //     nonceKey_add: bigint[];
// //     point_org: bigint[];
// //     ephemeralKey_org: bigint[];
// //     severed_commit_preimage: bigint;
// //     severed_random_value: bigint;
// //     unseal_condition_root: bigint;
// //     input_add: bigint;
// //     corresponding_public_key: bigint[];
// // };

// /**
//  * The very first proof usually take in the chain.
//  * Provides a merkle proof of a datastream
//  * Wraps circuit top_level_merkle_proof
//  */
// export class UnsealOpeningProof implements ChainableProofDefinition<validated_sig_he_addInputType> {
//     //Proof ID is best some form of identifier based on the circuit and other factors
//     //Must be universally unique even if the underlying circuit stays the same
//     private proofId: string = "0x0000000000000000000000000000000000000000000000000000000000000001";
//     private mode: ProofMode;
//     private address: string;
//     private provider: Provider | null;
//     // private circuit: WrappedNoirCircuit<validated_sig_he_addInputType> | null;
//     private suggested_static_inputs: CircuitInput[] = [
//         {name: "Ax", index_range: [0, 1], type: "Field"},
//         {name: "Ay", index_range: [1, 1], type: "Field"},
//         {name: "S", index_range: [2, 1], type: "Field"},
//         {name: "R8x", index_range: [3, 1], type: "Field"},
//         {name: "R8y", index_range: [4, 1], type: "Field"},
//         {name: "publicKey", index_range: [5, 2], type: "Array"},
//         {name: "nonceKey_add", index_range: [7, 8], type: "Array"},
//         {name: "point_org", index_range: [13, 16], type: "Array"},
//         {name: "ephemeralKey_org", index_range: [29, 16], type: "Array"},
//         {name: "severed_commit_preimage", index_range: [45, 1], type: "Field"},
//         {name: "severed_random_value", index_range: [46, 1], type: "Field"},
//         {name: "unseal_condition_root", index_range: [47, 1], type: "Field"},
//         {name: "input_add", index_range: [48, 1], type: "Field"},
//         {name: "corresponding_public_key", index_range: [49, 2], type: "Array"},
//     ];

//     private outputs: CircuitOutput[] = [
//         {name: "reveal_value", index_range: [0, 1], type: "Field"},
//         {name: "unseal_condition_root_commit", index_range: [1, 1], type: "Field"},
//         {name: "metadata_root_hash", index_range: [2, 1], type: "Field"},
//         {name: "ephemeralKey_he", index_range: [3, 16], type: "Array"},
//         {name: "point_he", index_range: [19, 16], type: "Array"},
//         {name: "publicKey_validated", index_range: [35, 2], type: "Array"},
//         {name: "publicKeyHe_validated", index_range: [37, 2], type: "Array"},
//         {name: "newCombinedPublicKey", index_range: [39, 2], type: "Array"},
        


//         // {name: "ephemeralKey_he", index_range: [0, 16], type: "Field"},
//         // {name: "point_he", index_range: [16, 16], type: "Field"},
//         // {name: "publicKey_validated", index_range: [32, 2], type: "Field"},
//         // {name: "publicKeyHe_validated", index_range: [34, 2], type: "Field"},
//         // {name: "newCombinedPublicKey", index_range: [36, 2], type: "Field"},
//         // {name: "reveal_value", index_range: [38, 1], type: "Field"},
//         // {name: "unseal_condition_root_commit", index_range: [39, 1], type: "Field"},
//         // {name: "metadata_root_commit", index_range: [40, 1], type: "Field"},
//     ];
//     private suggested_chained_inputs: ChainedInputSuggestion[] = [
        
//     ];
//     private suggested_chained_proofs: string[] = [];
//     constructor(
//         address: string,
//         provider: Provider | null = null,
//         mode: ProofMode = ProofMode.CREATE_REVEAL_ROOT,
//     ) {
//         this.mode = mode;
//         this.address = address;
//         this.provider = provider;
//         this.circuit = validatedSigHeAddCircuit
        
        
//     }
//     async initialize(): Promise<void> {
//         await this.circuit?.init()
//        // this.circuit = await circuit_KEY_HE_ADD();
//     }

//     get_id(): string {
//         return this.circuit?.get_id() || "";
//     }

//     get_description(): string {
//         return "Sub Tree Proof";
//     }

//     get_inputs(): CircuitInput[] {
//         return this.suggested_static_inputs;
//     }

//     get_input_index(name: string): [number, number] {
//         return this.suggested_static_inputs.find(input => input.name === name)?.index_range || [-1, 0];
//     }
//     get_output_index(name: string): [number, number] {
//         return this.outputs.find(output => output.name === name)?.index_range || [-1, 0];
//     }

//     get_outputs(): CircuitOutput[] {
//         return this.outputs;
//     }

//     get_suggested_chained_inputs(): ChainedInputSuggestion[] {
//         return this.suggested_chained_inputs;
//     }

//     async create_proof(inputs: validated_sig_he_addInputType): Promise<any> {
//         return await this.circuit?.generateProof({input: inputs});
//     }

//     async verify_proof(proof: any, public_signals: any[]): Promise<boolean> {
//         //TODO: Implement this
//         return await this.circuit?.verifyProof({proof, publicSignals: public_signals}) || false;
//     }

//     async verify_onchain_proof(proof: any, public_signals: any[]): Promise<boolean> {
//         //return await this.circuit.verifyOnchainProof(proof);
//         return false;
//     }
// }