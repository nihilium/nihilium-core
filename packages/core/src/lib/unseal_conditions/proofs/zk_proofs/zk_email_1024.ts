
import {  UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const ZKEmailProof1024 = new UnsealConditionProof({
    name: "ZKEmailProof1024",
    addressMapKey: "zk_email_proof_1024",
    description: "A proof that a ZK Email with a 1024-bit RSA DKIM key is valid.",
    version: "2.0.0",
    public_signals: {
        dkim_key_hash: [0, 1],
        domain: [1, 4],
        from_address_hash: [5, 1],
        subject_value: [6, 1],
    },
    complexity_score: 177_710,
});