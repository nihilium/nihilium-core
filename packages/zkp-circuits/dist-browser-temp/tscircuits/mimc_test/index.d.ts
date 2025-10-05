import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type mimc_testInputType = {
    p1: Field;
    p2: Field;
};
export type mimc_testReturnType = Field;
export declare const mimc_test_circuit: CompiledCircuit;
export declare function mimc_test(p1: Field, p2: Field, foreignCallHandler?: ForeignCallHandler): Promise<Field>;
