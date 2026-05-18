
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const ValueInjection = new UnsealConditionProof({
    name: "Value Injection",
    addressMapKey: "ValueInjection",
    description: "Value Injection",
    version: "1.0.0",
    public_signals: {
        value: [0, 1],
    },
});
