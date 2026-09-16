import { UnsealConditionProof } from "../types";
import { zkPassportProofDescriptor } from "./zkpassport_common";

/** Slot 6 holds the date-of-birth range commitment. See ZKPassportBirthdateModule. */
export const ZKPassportBirthdateProof: UnsealConditionProof = zkPassportProofDescriptor(
    "ZKPassportBirthdateProof",
    "birthdate",
    "A ZKPassport disclosure proof whose first parameter commitment is a date-of-birth range. " +
    "Verified by the same ZKPassportProof contract as the age variant -- the circuit is identical " +
    "and only the meaning of that commitment differs.",
);
