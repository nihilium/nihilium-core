import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type u1 = string;
export type sub_tree_merkle_proofInputType = {
    leaf_value: Field;
    root: Field;
    path: Field[];
    index_bits: u1[];
};
export type sub_tree_merkle_proofReturnType = [Field, Field, Field];
export declare const sub_tree_merkle_proof_circuit: CompiledCircuit;
export declare function sub_tree_merkle_proof(leaf_value: Field, root: Field, path: Field[], index_bits: u1[], foreignCallHandler?: ForeignCallHandler): Promise<[Field, Field, Field]>;
