import { ProofLibraryType } from "../proofs";
import { ModuleLibraryType, UnsealConditionModule } from "../modules";
import { CompiledCollectionExport, RequiredUserInput } from "./types";
import { UnsealProofAction } from "../types";
import { ACTION_STATIC_INPUT_FROM_USER, ChainedProof } from "../ChainedProof";
import { ACTION_STATIC_INPUT } from "../ChainedProof";
import { toPaddedHex } from "../../utils";




export class UnsealConditionTemplate {

    public name: string;
    public description: string;
    public proof_library: ProofLibraryType;
    public module_library: ModuleLibraryType;
    public compiled_collection: CompiledCollectionExport;
    public user_inputs: RequiredUserInput[];
    public UnsealProofActions: UnsealProofAction[];
    public modules: UnsealConditionModule[];
    
    constructor(name: string, description: string,
        proof_library: ProofLibraryType, 
        module_library: ModuleLibraryType, 
        compiled_collection: CompiledCollectionExport) {
        this.name = name;
        this.description = description;
        this.proof_library = proof_library;
        this.module_library = module_library;
        this.compiled_collection = compiled_collection;
        this.user_inputs = compiled_collection.user_inputs;
        this.modules = compiled_collection.compiled_modules.map((module) => 
            module_library.getModule(module.module_name ,proof_library));
        this.UnsealProofActions = [];
    }

    compile(input_mapping: {[key: string]: bigint}): void {
        var unseal_proof_actions: UnsealProofAction[] = [];
        for(var module of this.compiled_collection.compiled_modules) {
            for(var action of module.actions) {
                unseal_proof_actions.push(action);
            }
        }
        for(var user_input of this.user_inputs) {
            if(input_mapping[user_input.name] === undefined) {
                throw new Error("User input " + user_input.name + " is not mapped");
            }
            
          
            var found_action = false;
            for(var unseal_proof_action of unseal_proof_actions) {
                if(unseal_proof_action.action === ACTION_STATIC_INPUT_FROM_USER) {
                    if(unseal_proof_action.params.module_input_key === user_input.name) {
                        found_action = true;
                        unseal_proof_action = {
                            
                            action: ACTION_STATIC_INPUT,
                            params: {
                                public_input_index: user_input.signal_indexes[0],
                                value: toPaddedHex(input_mapping[user_input.name], 32),
                            }
                        };
                    }
                }
            }
            if(!found_action) {
                throw new Error("User input " + user_input.name + " is not a static input from user");
            }
        }
        this.UnsealProofActions = unseal_proof_actions;
    }

    async getUnsealRoot(): Promise<string> {
        //Make sure proofs and inputs are correct
        return await ChainedProof.calculateUnsealRoot(this.UnsealProofActions);
    }

}