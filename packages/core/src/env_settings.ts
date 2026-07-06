import { HexString, RevealConditions } from "./types/protocol/common";
// import { WrappedCircuit, createCircuit } from "nihilium-circuits";
// import { WrappedCircuit, createCircuit } from "./circuit-wrapper_remove";
import dotenv from "dotenv";

dotenv.config();


// var _circuit_ENCRYPT_PROOF: WrappedCircuit | null = null;
// var _circuit_KEY_HE_ADD: WrappedCircuit | null = null;
// var _circuit_SEVERED_COMMITMENT: WrappedCircuit | null = null;
// export async function circuit_ENCRYPT_PROOF(): Promise<WrappedCircuit> {
//     if(_circuit_ENCRYPT_PROOF) {
//         return _circuit_ENCRYPT_PROOF;
//     }
//     const circuit = await createCircuit({
//         name: "encrypt_proof",  
//         wasmPath: "./circuits/encrypt_proof/encrypt_proof_js/encrypt_proof.wasm",
//         zkeyPath: "./circuits/encrypt_proof/groth16_pkey.zkey",
//         vkeyPath: "./circuits/encrypt_proof/groth16_vkey.json",
//         signalsPath: "./circuits/encrypt_proof/signals.json"
//     });
//     _circuit_ENCRYPT_PROOF = circuit;
//     return _circuit_ENCRYPT_PROOF;
// }

// export async function circuit_KEY_HE_ADD(): Promise<WrappedCircuit> {
//     if(_circuit_KEY_HE_ADD) {
//         return _circuit_KEY_HE_ADD;
//     }
//     const circuit = await createCircuit({
//         name: "key_he_add",   
//         wasmPath: "./circuits/validated_sig_he_add/validated_sig_he_add_js/validated_sig_he_add.wasm",
//         zkeyPath: "./circuits/validated_sig_he_add/groth16_pkey.zkey",
//         vkeyPath: "./circuits/validated_sig_he_add/groth16_vkey.json",
//         signalsPath: "./circuits/validated_sig_he_add/signals.json"
//     });
//     _circuit_KEY_HE_ADD = circuit;
//     return _circuit_KEY_HE_ADD;
// }

// export async function circuit_SEVERED_COMMITMENT(): Promise<WrappedCircuit> {
//     if(_circuit_SEVERED_COMMITMENT) {
//         return _circuit_SEVERED_COMMITMENT;
//     }
//     const circuit = await createCircuit({
//         name: "severed_commitment",
//         wasmPath: "./circuits/severed_commitment/severed_commitment_js/severed_commitment.wasm",
//         zkeyPath: "./circuits/severed_commitment/groth16_pkey.zkey",
//         vkeyPath: "./circuits/severed_commitment/groth16_vkey.json",
//         signalsPath: "./circuits/severed_commitment/signals.json"
//     });
//     _circuit_SEVERED_COMMITMENT = circuit;
//     return _circuit_SEVERED_COMMITMENT;
// }



export type EnvSettings = {
    sc_addresses: Map<RevealConditions, HexString>,   
    sc_circuits: Map<RevealConditions, HexString>    

}

const dev_settings: EnvSettings = {
    sc_addresses: new Map([
        [RevealConditions.TOP_LEVEL, "0000000000000000000000000000000000000000"],
        [RevealConditions.TIMELOCK, "0000000000000000000000000000000000000000"],
        [RevealConditions.IDENTITY_PROOF, "0000000000000000000000000000000000000000"],
        [RevealConditions.NON_INTERVENTION_PROOF, "0000000000000000000000000000000000000000"]
    ]),
    sc_circuits: new Map([  
        [RevealConditions.TOP_LEVEL, "0000000000000000000000000000000000000000"],
        [RevealConditions.TIMELOCK, "0000000000000000000000000000000000000000"],
        [RevealConditions.IDENTITY_PROOF, "0000000000000000000000000000000000000000"],
        [RevealConditions.NON_INTERVENTION_PROOF, "0000000000000000000000000000000000000000"]
    ])
}

const stage_settings: EnvSettings = {
    sc_addresses: new Map([
        [RevealConditions.TOP_LEVEL, "0000000000000000000000000000000000000000"],
        [RevealConditions.TIMELOCK, "0000000000000000000000000000000000000000"],
        [RevealConditions.IDENTITY_PROOF, "0000000000000000000000000000000000000000"],
        [RevealConditions.NON_INTERVENTION_PROOF, "0000000000000000000000000000000000000000"]
    ]),
    sc_circuits: new Map([  
        [RevealConditions.TOP_LEVEL, "0000000000000000000000000000000000000000"],
        [RevealConditions.TIMELOCK, "0000000000000000000000000000000000000000"],
        [RevealConditions.IDENTITY_PROOF, "0000000000000000000000000000000000000000"],
        [RevealConditions.NON_INTERVENTION_PROOF, "0000000000000000000000000000000000000000"]
    ])
}

async function get_prod_settings(): Promise<EnvSettings> {
    throw new Error("Not implemented");
}




export async function get_env_settings(env:string = ""): Promise<EnvSettings> {
    const env_settings = process.env.ENV;
    if (env === "" && env_settings) {
        env = env_settings;
    }
    if (env === "dev") {
        return dev_settings;
    } else if (env === "stage") {
        return stage_settings;
    } else if (env === "prod") {
        return await get_prod_settings();
    } else {
        throw new Error("Invalid environment, set ENV=dev, stage, or prod");
    }
}
