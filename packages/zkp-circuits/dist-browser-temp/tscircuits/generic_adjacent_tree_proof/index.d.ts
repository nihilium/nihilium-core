import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type u32 = string;
export type u1 = string;
export type generic_adjacent_tree_proofInputType = {
    leaf_value: Field;
    root: Field;
    depth: u32;
    original_index: u32;
    path: Field[];
    index_bits: u1[];
};
export type generic_adjacent_tree_proofReturnType = [Field, Field, u32, u32, u32];
export declare const generic_adjacent_tree_proof_circuit: CompiledCircuit;
export declare function generic_adjacent_tree_proof(leaf_value: Field, root: Field, depth: u32, original_index: u32, path: Field[], index_bits: u1[], foreignCallHandler?: ForeignCallHandler): Promise<[Field, Field, u32, u32, u32]>;
