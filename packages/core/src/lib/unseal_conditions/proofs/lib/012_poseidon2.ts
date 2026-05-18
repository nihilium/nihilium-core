
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const Poseidon2Verifier = new UnsealConditionProof({
    name: "Poseidon2Verifier",
    addressMapKey: "Poseidon2Verifier",
    description: "Poseidon2Verifier",
    version: "1.0.0",
    public_signals: {
        input0: [0, 1],
        input1: [1, 1],
        input2: [2, 1],
        expectedHash: [3, 1],
    },
});
