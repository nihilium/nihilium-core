import { UnsealConditionProof } from "../types";

/**
 * publicInputs[0] is a routing signal carrying the circuit's verification-key hash. It is consumed
 * and stripped by the ZKPassportProof contract, which uses it to pick the Honk verifier; that
 * verifier only ever sees the circuit's own twelve inputs.
 */
export const ZKPASSPORT_ROUTING_PREFIX_LENGTH = 1;

/**
 * Builds a ZKPassport disclosure-proof descriptor.
 *
 * Every ZKPassport claim rides the same circuit and the same deployed verifier, so the descriptors
 * differ in exactly two ways: the address-map key, and the name given to the first parameter
 * commitment. They have to be separate UnsealConditionProof objects rather than one shared
 * descriptor because StandardProofLibrary keys its map by `addressMapKey` -- two descriptors
 * sharing a key would silently overwrite one another.
 *
 * The signal map must be a contiguous cover of [0, N) in order. UnsealConditionTemplate.compile()
 * defaults to optimize = true, and ChainedProofV2 builds its flat output list and prune mask from
 * getOutputSize() -- the sum of these lengths -- while the contract appends the runtime array. A
 * partial declaration silently misaligns every later index, and an on-chain challenge replay then
 * fails to reproduce the off-chain unseal root.
 *
 * Indices 1..12 are the outer_evm circuit's own public inputs. `oprf_pk_hash` was appended in
 * ZKPassport 0.16 (the salted-nullifier work), taking the circuit from 11 inputs to 12; everything
 * before it kept its index. Anything reading the nullifier as `publicInputs[length - 1]` broke
 * silently at that release.
 *
 * Slots 6..9 are the four parameter commitments. Which commitment lands in which slot follows the
 * order of the disclosure sub-proofs in the request, and is trusted here rather than discovered:
 * if ZKPassport ever reorders them, the signal the module substitutes will not match the proof's
 * own public input and on-chain verification fails.
 *
 * @param claimSignal What slot 6 holds for this descriptor -- "age", "birthdate", and so on.
 */
export function zkPassportProofDescriptor(
    addressMapKey: string,
    claimSignal: string,
    description: string,
): UnsealConditionProof {
    return new UnsealConditionProof({
        name: addressMapKey,
        addressMapKey,
        description,
        version: "1.0.0",
        public_signals: {
            vkey_hash: [0, 1],
            certificate_registry_root: [1, 1],
            circuit_registry_root: [2, 1],
            current_date: [3, 1],
            scope: [4, 1],
            subscope: [5, 1],
            [claimSignal]: [6, 1],
            name: [7, 1],
            custom_data: [8, 1],
            param_commitment_3: [9, 1],
            nullifier_type: [10, 1],
            nullifier: [11, 1],
            oprf_pk_hash: [12, 1],
        },
        complexity_score: 250_000,
    });
}
