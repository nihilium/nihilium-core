import { UnsealConditionProof } from "../types";

/**
 * Ties the value bound into a ZKPassport proof's custom_data to its plaintext.
 *
 * Verified by FormatBoundData from its public signals alone, so the proof bytes are empty -- the
 * same shape as KeccakTreeEntry. The commitment is what the passport proof carries; the plain
 * value is the seal's reveal value, which is what makes a passport proof usable for exactly one
 * unseal.
 */
export const ZkPassportCustomDataFormatProof = new UnsealConditionProof({
    name: "ZkPassportCustomDataFormatProof",
    addressMapKey: "ZkPassportCustomDataFormatProof",
    description: "Proves a ZKPassport bound-data commitment corresponds to a given plain value.",
    version: "1.0.0",
    public_signals: {
        custom_data_commitment: [0, 1],
        custom_data: [1, 1],
    },
    complexity_score: 250_000,
});
