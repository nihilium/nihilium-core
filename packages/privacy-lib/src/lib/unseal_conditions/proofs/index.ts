
import { UnsealOpeningProof } from "./lib/000_unseal_opening_proof"
import { SubTreeProof } from "./lib/001_sub_tree_proof";
import { TopLevelTreeProof } from "./lib/002_top_level_tree_proof";
import { UnsealConditionProof } from "./types"


export type ProofLibraryType = {
    standard: {
        [key: string]: new (...args: any[]) => UnsealConditionProof;
    },
    custom: {
        [key: string]: new (...args: any[]) => UnsealConditionProof;
    },
}

export const ProofLibrary: ProofLibraryType = {
    standard: {
        ["UnsealOpeningProof"]: UnsealOpeningProof,
        ["TopLevelTreeProof"]: TopLevelTreeProof,
        ["SubTreeProof"]: SubTreeProof,
    },
    custom: {        
    },
}
