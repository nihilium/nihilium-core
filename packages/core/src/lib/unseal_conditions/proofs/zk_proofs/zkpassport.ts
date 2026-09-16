/**
 * Superseded by the per-claim descriptors. ZKPassport disclosure proofs are now split so the
 * scenario editor can offer a named choice: ZKPassportAgeProof for a condition about current age,
 * ZKPassportBirthdateProof for one about a fixed date of birth. Both are verified by the same
 * deployed contract.
 *
 * Kept as a forwarding module so a stale import path still resolves. Delete once nothing imports it.
 */
export { ZKPASSPORT_ROUTING_PREFIX_LENGTH, zkPassportProofDescriptor } from "./zkpassport_common";
export { ZKPassportAgeProof } from "./zkpassport_age";
export { ZKPassportBirthdateProof } from "./zkpassport_birthdate";
