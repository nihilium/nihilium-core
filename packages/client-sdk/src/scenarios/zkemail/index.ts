/**
 * The ZKEmail scenario: seal a value behind a recovery-email condition, recover it by replying to that
 * email. Published as `@nihilium/client-sdk/scenarios/zkemail`.
 *
 * This barrel is the scenario's whole public surface. The package root re-exports it verbatim for
 * compatibility, and `subpaths.cjs` lists these same names to generate the published subpath facade —
 * so anything added here must be added there too (test/subpath_facades.test.ts enforces it for values).
 */
export { ZKEmailSealingClient } from "./zkemail_sealing_client";
export type { ZKEmailSealingOptions } from "./zkemail_sealing_client";

// ZKEmailUnsealPhase is both a const object and a type alias of its values; a plain `export {}`
// carries both meanings, so it must not be split into the `export type` list.
export { ZKEmailUnsealingClient, ZKEmailRecoveryStatus, ZKEmailUnsealPhase } from "./zkemail_unsealing_client";
export type { ZKEmailUnsealingOptions, FetchLike } from "./zkemail_unsealing_client";

export { hashEmailAddress } from "./email_hash";

export { checkEmailDomain, domainOf, domainVerdict } from "./email_domain";
export type { ZKEmailDomainCheck, ZKEmailDomainVerdict } from "./email_domain";
