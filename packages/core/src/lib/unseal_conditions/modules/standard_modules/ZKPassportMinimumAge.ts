import { ProofLibraryType } from "../../proofs";
import { ZKPassportClaimModule } from "./ZKPassportClaim";

/**
 * Gates an unseal on a ZKPassport minimum age.
 *
 * See ZKPassportClaimModule for the mechanism. This subclass shares ZKPassportAgeProof with
 * ZKPassportAgeModule -- same circuit, same slot 6, same deployed contract -- because what
 * separates the two is not the proof but the leaf set the sealer commits to.
 */
export class ZKPassportMinimumAgeModule extends ZKPassportClaimModule {
    constructor(proofLibrary: ProofLibraryType) {
        super(proofLibrary, {
            name: "ZKPassportMinimumAgeModule",
            shortDescription: "ZKPassport Minimum Age Module",
            proofKey: "ZKPassportAgeProof",
            claimSignal: "age",
            description: `
                Gates an unseal on a ZKPassport minimum age: at least 18, at least 21.

                Seal with @nihilium/client-sdk/zkpassport's atLeastAge(n), which commits the single
                leaf ZKPassport produces for a gte("age", n) query. That single leaf is the whole
                constraint: only a gte or gt proof reaches it, because an lte or a range query
                commits to a different value and fails the membership check.

                Reach for ZKPassportAgeModule when you want to state the age range yourself. Its
                committed range is whatever the sealer chose, so it says "the holder proved THIS
                range" and nothing about ordering -- if you commit a set that contains an upper
                bound, a holder under the bound opens the seal.

                The answer MOVES OVER TIME, because the circuit derives age from the date of birth
                against the proof's current_date. It moves in the harmless direction: someone too
                young today opens the seal after their next birthday, and nobody who could open it
                ever stops being able to. Reach for ZKPassportBirthdateModule when the cut-off has
                to be fixed -- "at least 18" and "born before 1 Jan 2008" describe the same people
                today and different people next year.

                Note the threshold is committed to, and a commitment to a low-entropy value is
                recoverable by anyone who sees it: n is one byte, so whoever has the root can
                confirm a guess at it. The gate is sound either way; the threshold is simply not
                secret.
            `,
        });
    }
}
