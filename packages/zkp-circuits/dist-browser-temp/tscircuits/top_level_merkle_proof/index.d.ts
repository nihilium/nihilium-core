import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type u1 = string;
export type top_level_merkle_proofInputType = {
    subtree_root: Field;
    block_timestamp: Field;
    root: Field;
    path: Field[];
    index_bits: u1[];
};
export type top_level_merkle_proofReturnType = [Field, Field, Field, Field];
export declare const top_level_merkle_proof_circuit: CompiledCircuit;
export declare function top_level_merkle_proof(subtree_root: Field, block_timestamp: Field, root: Field, path: Field[], index_bits: u1[], foreignCallHandler?: ForeignCallHandler): Promise<[Field, Field, Field, Field]>;
