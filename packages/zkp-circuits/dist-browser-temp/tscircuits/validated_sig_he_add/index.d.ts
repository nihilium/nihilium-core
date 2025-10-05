import { type CompiledCircuit, type ForeignCallHandler } from "@noir-lang/noir_js";
export { type ForeignCallHandler } from "@noir-lang/noir_js";
export type Field = string;
export type Curve = {
    x: Field;
    y: Field;
};
export type validated_sig_he_addInputType = {
    A: Curve;
    S: Field;
    R8x: Field;
    R8y: Field;
    publicKey: Curve;
    nonceKey: Field[];
    point_org: Curve[];
    ephemeralKey_org: Curve[];
    severed_commit_preimage: Field;
    severed_random_value: Field;
    unseal_condition_root: Field;
    input_add: Field;
    metadata_root: Field;
    corresponding_public_key: Curve;
};
export type validated_sig_he_addReturnType = [Field, Field, Field, Curve[], Curve[], Curve, Curve, Curve];
export declare const validated_sig_he_add_circuit: CompiledCircuit;
export declare function validated_sig_he_add(A: Curve, S: Field, R8x: Field, R8y: Field, publicKey: Curve, nonceKey: Field[], point_org: Curve[], ephemeralKey_org: Curve[], severed_commit_preimage: Field, severed_random_value: Field, unseal_condition_root: Field, input_add: Field, metadata_root: Field, corresponding_public_key: Curve, foreignCallHandler?: ForeignCallHandler): Promise<[Field, Field, Field, Curve[], Curve[], Curve, Curve, Curve]>;
