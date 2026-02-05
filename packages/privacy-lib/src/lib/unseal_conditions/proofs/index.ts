
import { UnsealOpeningProof } from "./lib/000_unseal_opening_proof"
import { SubTreeProof } from "./lib/001_sub_tree_proof";
import { TopLevelTreeProof } from "./lib/002_top_level_tree_proof";
import { KeccakTreeEntryProof } from "./lib/003_keccak_tree_entry";
import { GreaterOrEqualThenProof } from "./lib/005_greater_or_equal";
import { SmallerThanProof } from "./lib/004_smaller_than";


import { UnsealConditionProof } from "./types"
import { TimeDelayProof } from "./lib/006_time_delay";
import { ManualChoiceProof } from "./lib/007_manual_choice";
import { VerifyECDSAProof } from "./lib/009_verify_ecdsa";
import { VerifyEDDSAProof } from "./lib/008_verify_eddsa";

export abstract class ProofLibraryType {
    standard: {
        [key: string]: UnsealConditionProof;
    } = {};
    custom: {
        [key: string]: UnsealConditionProof;
    } = {};
  
    addCustomProof(name: string, proof: UnsealConditionProof): void {
        this.custom[name] = proof;
    }
    getProof(name: string): UnsealConditionProof {
        if(this.standard[name]) {
            return this.standard[name];
        }
        if(this.custom[name]) {
            return this.custom[name];
        }
        throw new Error("Proof " + name + " not found");
        
    }
}

export class StandardProofLibrary extends ProofLibraryType {
    public standard: {[key: string]: UnsealConditionProof} = {
        // ["UnsealOpeningProof"]: UnsealOpeningProof,
        // ["TopLevelTreeProof"]: TopLevelTreeProof,
        // ["SubTreeProof"]: SubTreeProof,
        // ["KeccakTreeEntryProof"]: KeccakTreeEntryProof,
        // ["SmallerThanProof"]: SmallerThanProof,
        // ["GreaterOrEqualThenProof"]: GreaterOrEqualThenProof,
        // ["TimeDelayProof"]: TimeDelayProof,
    };
    public custom: {[key: string]: UnsealConditionProof} = {};
    constructor() {
        super();
        for(const proof of Object.values(standardProofs)) {
            this.standard[proof.data.addressMapKey] = proof;
        }
    }
}

export const standardProofs = {
    UnsealOpeningProof,
    TopLevelTreeProof,
    SubTreeProof,
    KeccakTreeEntryProof,
    SmallerThanProof,
    GreaterOrEqualThenProof,
    TimeDelayProof,
    VerifyECDSAProof,
    VerifyEDDSAProof,
    ManualChoiceProof
}
