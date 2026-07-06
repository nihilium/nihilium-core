import { BeforeTimeModule } from './standard_modules/before_time_module';

import { AfterTimeModule } from './standard_modules/after_time_module';
import { DefaultAnchoredOpeningProofModule } from './standard_modules/default_anchored_opening_module';
import { TimeDelayModule } from './standard_modules/time_delay';
import { UnsealConditionModule } from './types';
import { ProofLibraryType } from '../proofs';
import { MerkleTreeModule } from './standard_modules/merkle_tree_module';
import { ManualChoiceModule } from './standard_modules/manual_choice';
import { TopLevelTreeModule } from './standard_modules/top_level_tree_module';
import { HashPreimageModule } from './standard_modules/hash_preimage';
import { ZKPassportDummyModule } from './dummy_modules/ZKPassportDummy';
import { ZKEmailDummyModule } from './dummy_modules/ZKEmailDummy';
import { VerifyECDSAModule } from './standard_modules/verify_ecdsa';
import { VerifyEDDSAModule } from './standard_modules/verify_eddsa';
import { AdjacentDataSelectionModule } from './standard_modules/adjacent_data_selection';
import { ExclusionClaimModule } from './standard_modules/exclusion_claim';
import { InclusionProofModule } from './standard_modules/inclusion_proof';
import { ValueInjectionModule } from './standard_modules/value_injection';
import { ZKEmailModule } from './standard_modules/ZKEmail';
import { HashTieModule } from './standard_modules/hash_tie';

export {
    BeforeTimeModule,
    AfterTimeModule,
    DefaultAnchoredOpeningProofModule,
    TimeDelayModule,
    MerkleTreeModule,
    ManualChoiceModule,
    TopLevelTreeModule,
    HashPreimageModule,
    ZKPassportDummyModule,
    ZKEmailDummyModule,
    VerifyECDSAModule,
    VerifyEDDSAModule,
    AdjacentDataSelectionModule,
    ExclusionClaimModule,
    InclusionProofModule,
    ValueInjectionModule,
    ZKEmailModule,
    HashTieModule
}

export * from './types';



export abstract class ModuleLibraryType {
    public standard: {
        [key: string]: new (...args: any[]) => UnsealConditionModule;
    } = {};
    public custom: {
        [key: string]: new (...args: any[]) => UnsealConditionModule;
    } = {};
    addCustomModule(name: string, module: new (...args: any[]) => UnsealConditionModule): void {
        this.custom[name] = module;
    }
    getModule(name: string, proofLibrary: ProofLibraryType): UnsealConditionModule {
        if(this.standard[name]) {
            return new this.standard[name](proofLibrary);
        }
        if(this.custom[name]) {
            return new this.custom[name](proofLibrary);
        }
        throw new Error("Module " + name + " not found");
    }


}

export class StandardModuleLibrary extends ModuleLibraryType {
    public standard: {[key: string]: new (...args: any[]) => UnsealConditionModule} = {
        ["UnsealOpeningModule"]: DefaultAnchoredOpeningProofModule,
        ["ManualChoiceModule"]: ManualChoiceModule,
        ["AfterTimeModule"]: AfterTimeModule,
        
        ["BeforeTimeModule"]: BeforeTimeModule,
        ["TimeDelayModule"]: TimeDelayModule,
        
        ["TopLevelTreeModule"]: TopLevelTreeModule,
        ["MerkleTreeModule"]: MerkleTreeModule,
        
        ["HashPreimageModule"]: HashPreimageModule,
        ["ZKPassportModule"]: ZKPassportDummyModule,
        ["ZKEmailModule"]: ZKEmailModule,
        ["VerifyEDDSAModule"]: VerifyEDDSAModule,
        ["VerifyECDSAModule"]: VerifyECDSAModule,
        ["AdjacentDataSelectionModule"]: AdjacentDataSelectionModule,
        ["ExclusionClaimModule"]: ExclusionClaimModule,
        ["InclusionProofModule"]: InclusionProofModule,
        ["ValueInjectionModule"]: ValueInjectionModule,
        ["HashTieModule"]: HashTieModule,
    };
    public custom: {[key: string]: new (...args: any[]) => UnsealConditionModule} = {};
    constructor() {
        super();
    }
}
