import { ProofLibraryType } from "../../proofs";
import { ZKPassportClaimModule } from "./ZKPassportClaim";

/**
 * Gates an unseal on a ZKPassport date-of-birth range.
 *
 * See ZKPassportClaimModule for the mechanism; this subclass only fixes which claim is gated on.
 */
export class ZKPassportBirthdateModule extends ZKPassportClaimModule {
    constructor(proofLibrary: ProofLibraryType) {
        super(proofLibrary, {
            name: "ZKPassportBirthdateModule",
            shortDescription: "ZKPassport Birthdate Module",
            proofKey: "ZKPassportBirthdateProof",
            claimSignal: "birthdate",
            description: `
                Gates an unseal on a ZKPassport date-of-birth range.

                Use this when the condition is a fixed point in time: born before a date, born in a
                given year. A date of birth never changes, so the same passport gives the same
                answer forever -- which is what you want for an entitlement tied to a cohort rather
                than to a current age.

                Reach for ZKPassportAgeModule instead when the condition really is about current
                age and should follow the holder as they get older.

                Note the range is committed to, and a commitment to a low-entropy value is
                recoverable by anyone who sees it: a narrow range identifies the holder far more
                than a wide one. "Born before 1 Jan 2008" leaks almost nothing; an exact date is
                close to an identifier.
            `,
        });
    }
}
