import { BeforeTimeModule } from './standard_modules/before_time_module';

import { AfterTimeModule } from './standard_modules/after_time_module';
import { DefaultAnchoredOpeningProofModule } from './standard_modules/default_anchored_opening_module';
import { TimeDelayModule } from './standard_modules/time_delay';
import { UnsealConditionModule } from './types';

export * from './standard_modules/default_anchored_opening_module';
export * from './standard_modules/after_time_module';
export * from './types';



export type ModuleLibraryType = {
    standard: {
        [key: string]: new (...args: any[]) => UnsealConditionModule;
    },
    custom: {
        [key: string]: new (...args: any[]) => UnsealConditionModule;
    },


}

export const StandardModuleLibrary: ModuleLibraryType = {
    standard: {
        ["DefaultAnchoredOpeningModule"]: DefaultAnchoredOpeningProofModule,
        ["AfterTimeModule"]: AfterTimeModule,
        ["TimeDelayModule"]: TimeDelayModule,
        ["BeforeTimeModule"]: BeforeTimeModule,
    },
    custom: {        
    },
}