import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type u32 = string;
export type u1 = string;
export type generic_tree_proofInputType = {
    leaf_value: Field;
    root: Field;
    depth: u32;
    path: Field[];
    index_bits: u1[];
};
export type generic_tree_proofReturnType = [Field, Field];
export declare const generic_tree_proof_circuit: CompiledCircuit;
export declare function generic_tree_proof(leaf_value: Field, root: Field, depth: u32, path: Field[], index_bits: u1[], foreignCallHandler?: ForeignCallHandler): Promise<[Field, Field]>;
