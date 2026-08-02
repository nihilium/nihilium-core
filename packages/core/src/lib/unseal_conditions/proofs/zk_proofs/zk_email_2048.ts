
import {  UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const ZKEmailProof2048 = new UnsealConditionProof({
    name: "ZKEmailProof2048",
    addressMapKey: "zk_email_proof_2048",
    description: "A proof that a ZK Email with a 2048-bit RSA DKIM key is valid.",
    version: "2.0.0",
    public_signals: {
        dkim_key_hash: [0, 1],
        domain: [1, 4],
        from_address_hash: [5, 1],
        subject_value: [6, 1],
    },
    complexity_score: 191_224,
});
