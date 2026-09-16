/**
 * ZKPassport signal commitments, published as `@nihilium/client-sdk/zkpassport`.
 *
 * This is the layer that knows ZKPassport's own commitment formats, which is why it lives here and
 * not in @nihilium/core: core's ZKPassportModule marshals proofs and owns the merkle tree, but
 * takes the commitment material as an input so it needs no ZKPassport dependency. Same split as
 * ZKEmail, whose hashEmailAddress lives in its scenario rather than in core.
 *
 * Deliberately not a scenario: no sealing or unsealing client, no collection. Build the collection
 * in the chained-proof editor and drive it with whichever clients suit the application.
 */
export {
    atLeastAge,
    findAgeMatches,
    findBirthdateMatches,
    getSignalLeaves,
    getCommitments,
    getMerkleCommitment,
    generateSignalCommitments,
    verifySignalCommitments,
    hashSignalCommitmentRequest,
    SIGNAL_TREE_DEPTH,
} from "./signal_commitments";

export type {
    SignalCommitmentRequest, SignalCommitmentResponse, AgeRange, BirthdateRange,
} from "./signal_commitments";
