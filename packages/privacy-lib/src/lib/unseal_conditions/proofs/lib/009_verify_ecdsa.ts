
import { UnsealConditionProof } from "../types";


/**
 * The very first proof usually take in the chain.
 * Provides a merkle proof of a datastream
 * Wraps circuit top_level_merkle_proof
 */
export const VerifyECDSAProof = new UnsealConditionProof({
    name: "Verify ECDSA Proof",
    addressMapKey: "VerifyECDSAProof",
    description: "Verify ECDSA Proof",
    version: "1.0.0",
    public_signals: {
        signer_address: [0, 1],
        message_hash: [1, 1],
    },
});
