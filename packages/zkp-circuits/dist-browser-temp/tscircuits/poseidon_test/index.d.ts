import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type poseidon_testInputType = {
    p1: Field;
    p2: Field;
};
export type poseidon_testReturnType = Field;
export declare const poseidon_test_circuit: CompiledCircuit;
export declare function poseidon_test(p1: Field, p2: Field, foreignCallHandler?: ForeignCallHandler): Promise<Field>;
