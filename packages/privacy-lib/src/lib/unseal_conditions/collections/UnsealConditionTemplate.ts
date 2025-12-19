import { ProofLibraryType } from "../proofs";
import { ModuleLibraryType, UnsealConditionModule } from "../modules";
import { CompiledCollectionExport, RequiredUserInput } from "./types";




class UnsealConditionTemplate {

    public name: string;
    public description: string;
    public proof_library: ProofLibraryType;
    public module_library: ModuleLibraryType;
    public compiled_collection: CompiledCollectionExport;
    public user_inputs: RequiredUserInput[];
    public modules: UnsealConditionModule[];
    
    constructor(name: string, description: string, proof_library: ProofLibraryType, module_library: ModuleLibraryType, compiled_collection: CompiledCollectionExport) {
        this.name = name;
        this.description = description;
        this.proof_library = proof_library;
        this.module_library = module_library;
        this.compiled_collection = compiled_collection;
        this.user_inputs = compiled_collection.user_inputs;
        this.modules = compiled_collection.compiled_modules.map((module) => 
            new module_library.standard[module.module_id](proof_library) as UnsealConditionModule);

    }

}