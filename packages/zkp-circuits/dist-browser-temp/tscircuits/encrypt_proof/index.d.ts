import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type Curve = {
    x: Field;
    y: Field;
};
export type encrypt_proofInputType = {
    privateKeyScalar: Field;
    publicKey: Curve;
    nonceKey_p: Field[];
};
export type encrypt_proofReturnType = [Curve, Curve[], Curve[]];
export declare const encrypt_proof_circuit: CompiledCircuit;
export declare function encrypt_proof(privateKeyScalar: Field, publicKey: Curve, nonceKey_p: Field[], foreignCallHandler?: ForeignCallHandler): Promise<[Curve, Curve[], Curve[]]>;
