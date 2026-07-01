
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const VerifyEDDSAProof = new UnsealConditionProof({
    name: "Verify EDDSA Proof",
    addressMapKey: "VerifyEDDSAProof",
    description: "Verify EDDSA Proof",
    version: "1.0.0",
    public_signals: {
        signer_address: [0, 1],
        message_hash: [1, 1],
    },
    complexity_score: 250_000,
});
