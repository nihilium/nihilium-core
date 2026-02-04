import { BeforeTimeModule } from './standard_modules/before_time_module';

import { AfterTimeModule } from './standard_modules/after_time_module';
import { DefaultAnchoredOpeningProofModule } from './standard_modules/default_anchored_opening_module';
import { TimeDelayModule } from './standard_modules/time_delay';
import { UnsealConditionModule } from './types';
import { ProofLibraryType } from '../proofs';
import { SubTreeModule } from './standard_modules/sub_tree_module';
import { ManualChoiceModule } from './standard_modules/manual_choice';
import { TopLevelTreeModule } from './standard_modules/top_level_tree_module';
import { HashPreimageModule } from './standard_modules/hash_preimage';
import { ZKPassportDummyModule } from './dummy_modules/ZKPassportDummy';
import { ZKEmailDummyModule } from './dummy_modules/ZKEmailDummy';

export * from './standard_modules/default_anchored_opening_module';
export * from './standard_modules/after_time_module';
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
        ["DefaultAnchoredOpeningModule"]: DefaultAnchoredOpeningProofModule,
        ["AfterTimeModule"]: AfterTimeModule,
        ["TimeDelayModule"]: TimeDelayModule,
        ["BeforeTimeModule"]: BeforeTimeModule,
        ["SubTreeModule"]: SubTreeModule,
        ["TopLevelTreeModule"]: TopLevelTreeModule,
        ["ManualChoiceModule"]: ManualChoiceModule,
        ["HashPreimageModule"]: HashPreimageModule,
        ["ZKPassportDummyModule"]: ZKPassportDummyModule,
        ["ZKEmailDummyModule"]: ZKEmailDummyModule,
    };
    public custom: {[key: string]: new (...args: any[]) => UnsealConditionModule} = {};
    constructor() {
        super();
    }
}

export const standardModules = {
    DefaultAnchoredOpeningModule: DefaultAnchoredOpeningProofModule,
    AfterTimeModule: AfterTimeModule,
    TimeDelayModule: TimeDelayModule,
    BeforeTimeModule: BeforeTimeModule,
}