import { ProofLibraryType } from "../../proofs";
import { ZKPassportClaimModule } from "./ZKPassportClaim";

/**
 * Gates an unseal on a ZKPassport age range.
 *
 * See ZKPassportClaimModule for the mechanism; this subclass only fixes which claim is gated on.
 */
export class ZKPassportAgeModule extends ZKPassportClaimModule {
    constructor(proofLibrary: ProofLibraryType) {
        super(proofLibrary, {
            name: "ZKPassportAgeModule",
            shortDescription: "ZKPassport Age Module",
            proofKey: "ZKPassportAgeProof",
            claimSignal: "age",
            description: `
                Gates an unseal on a ZKPassport age range the sealer states itself.

                Seal with @nihilium/client-sdk/zkpassport's age: { min, max }, which commits the one
                leaf ZKPassport produces for that range -- (n, n) for an exact age, (0, n) for an
                upper bound, (a, b) for a band. The holder's proof has to have used the matching
                query, so pick the range the condition actually means.

                This module says "the holder proved THIS range" and nothing about ordering. For an
                over-N gate reach for ZKPassportMinimumAgeModule, which is the same mechanism with
                the range fixed to (n, 0) and a name that says so.

                Use this when the condition is genuinely about how old someone is *now*. The circuit
                derives age from the date of birth against the proof's current_date, so the answer
                MOVES OVER TIME -- a seal made against "exactly 37" stops opening after the holder's
                next birthday, and one against "18 or over" starts opening for people it previously
                refused.

                Reach for ZKPassportBirthdateModule instead when you mean a fixed cut-off. "Born
                before 1 Jan 2008" and "at least 18" describe the same people today and different
                people next year.
            `,
        });
    }
}
