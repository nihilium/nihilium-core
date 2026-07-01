
import {  UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const ZKEmailProof = new UnsealConditionProof({
    name: "ZKEmailProof",
    addressMapKey: "zk_email_proof",
    description: "A proof that a ZK Email is valid.",
    version: "1.0.0",
    public_signals: {
        dkim_key_hash: [0, 1],
        subject_value: [1, 1],
        from_address_hash: [2, 1],
    },
    complexity_score: 250_000,
});
