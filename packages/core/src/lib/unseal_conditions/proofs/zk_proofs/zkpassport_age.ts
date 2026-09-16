import { UnsealConditionProof } from "../types";
import { zkPassportProofDescriptor } from "./zkpassport_common";

/** Slot 6 holds the age-range commitment. See ZKPassportAgeModule for when to reach for it. */
export const ZKPassportAgeProof: UnsealConditionProof = zkPassportProofDescriptor(
    "ZKPassportAgeProof",
    "age",
    "A ZKPassport disclosure proof whose first parameter commitment is an age range. Verified by " +
    "the ZKPassportProof contract, which routes on the leading vkey_hash signal to the Honk " +
    "verifier it learned from ZKPassport's own registry.",
);
