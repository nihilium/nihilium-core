
import {  UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const HashTieProof = new UnsealConditionProof({
    name: "HashTieProof",
    addressMapKey: "hash_tie",
    description: "A proof proves you own a preimage of a hash and with it tied to a value",
    version: "1.0.0",
    public_signals: {
        tied_hash: [0, 1],
        tied_value: [1, 1],
        
        
    },
    complexity_score: 250_000,
});
