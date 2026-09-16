/**
 * Superseded by the per-claim modules. Gating on a ZKPassport proof is now split so the scenario
 * editor offers a named choice with a description: ZKPassportMinimumAgeModule for an over-N gate,
 * ZKPassportAgeModule when the sealer states the age range itself, ZKPassportBirthdateModule when
 * the condition is about a fixed date of birth.
 *
 * Kept as a forwarding module so a stale import path still resolves. Delete once nothing imports it.
 */
export { ZKPassportClaimModule } from "./ZKPassportClaim";
export type { ZKPassportCommitments, ZKPassportProductionInputs } from "./ZKPassportClaim";
export { ZKPassportAgeModule } from "./ZKPassportAge";
export { ZKPassportBirthdateModule } from "./ZKPassportBirthdate";
export { ZKPassportMinimumAgeModule } from "./ZKPassportMinimumAge";
