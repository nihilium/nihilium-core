import { ProofLibraryType } from "../proofs";
import { ModuleLibraryType, UnsealConditionModule } from "../modules";
import { CompiledCollectionExport, DataStreamInput, RequiredUserInput } from "./types";
import { UnsealProofAction } from "../types";
import { ACTION_STATIC_INPUT_FROM_USER, ACTION_VALIDATE_DATA_ROOT, ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT, ChainedProof } from "../ChainedProof";
import { ACTION_STATIC_INPUT } from "../ChainedProof";
import { toPaddedHex } from "../../utils";
import { createKeccakMerkelTree } from '../../utils';
import { UnsealConditionTemplateExport } from "../../../types/protocol/common";
import { ProofPath } from "fixed-merkle-tree";


export const from_json = (json_object: UnsealConditionTemplateExport,
    proof_library: ProofLibraryType,
    module_library: ModuleLibraryType,
): UnsealConditionTemplate => {

    var toReturn = new UnsealConditionTemplate(json_object.name, json_object.description,
        proof_library, module_library, json_object.compiled_collection);
    var bigInt_used_input_mapping: { [key: string]: bigint } = {};
    for (var key of Object.keys(json_object.used_input_mapping)) {
        bigInt_used_input_mapping[key] = BigInt(json_object.used_input_mapping[key]);
    }
    toReturn.user_inputs = json_object.user_inputs;
    toReturn.unsealProofActions = json_object.unseal_proof_actions;
    toReturn.used_input_mapping = bigInt_used_input_mapping;
    toReturn.collection_id = json_object.collection_id;
    return toReturn;
}

export class UnsealConditionTemplate {

    public name: string;
    public collection_id: string = "";
    public description: string;
    public proof_library: ProofLibraryType;
    public module_library: ModuleLibraryType;
    public compiled_collection: CompiledCollectionExport;
    public user_inputs: RequiredUserInput[][];
    public unsealProofActions: UnsealProofAction[][];
    public data_streams: DataStreamInput[][];
    public modules: UnsealConditionModule[];
    public used_input_mapping: { [key: string]: any } = {};

    constructor(name: string, description: string,
        proof_library: ProofLibraryType,
        module_library: ModuleLibraryType,
        compiled_collection: CompiledCollectionExport,
    ) {
        this.name = name;
        this.description = description;
        this.proof_library = proof_library;
        this.module_library = module_library;
        this.compiled_collection = compiled_collection;
        this.user_inputs = compiled_collection.user_inputs;
        this.data_streams = compiled_collection.data_stream_inputs;
        //TODO make distinct modules
        this.modules = compiled_collection.compiled_modules.flat().map((module) =>
            module_library.getModule(module.module_name, proof_library));
        this.unsealProofActions = [];
    }

    export_compiled_to_json(): UnsealConditionTemplateExport {
        var string_used_input_mapping: { [key: string]: string } = {};
        for (var key of Object.keys(this.used_input_mapping)) {
            string_used_input_mapping[key] = toPaddedHex(this.used_input_mapping[key], 32);
        }
        return {
            name: this.name,
            description: this.description,
            unseal_proof_actions: this.unsealProofActions,
            user_inputs: this.user_inputs,
            used_input_mapping: string_used_input_mapping,
            compiled_collection: this.compiled_collection,
            collection_id: this.collection_id,
        };
    }
    isCompiled(): boolean {
        return this.unsealProofActions.length > 0;
    }
    compile(input_mapping: { [key: string]: bigint }, data_stream_mapping: { [key: string]: string }): void {
        if (this.isCompiled()) {
            throw new Error("Template already compiled");
        }
        this.used_input_mapping = input_mapping;
        var unseal_proof_action_paths: UnsealProofAction[][] = [];
        var path_index = 0;
        for (var module_path of this.compiled_collection.compiled_modules) {

            for (var module of module_path) {

                for (var action of module.actions) {
                    if (unseal_proof_action_paths[path_index] === undefined) {
                        unseal_proof_action_paths[path_index] = [];
                    }
                    unseal_proof_action_paths[path_index].push(action);
                }
            }
            path_index += 1;
        }


        /*

if(unseal_proof_action.action === ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT) {
                            if(unseal_proof_action.params.datastream_id === data_stream.datastream_id) {
                                found_action = true;
                                unseal_proof_action = {
                                    action: ACTION_VALIDATE_DATA_ROOT,
                                    params: {
                                        address: data_stream.datastream_id,
                                    }
                                };
                            }
                        }


        */


        for (var user_input_path of this.user_inputs) {
            for (var user_input of user_input_path) {
                if (input_mapping[user_input.name] === undefined) {
                    throw new Error("User input " + user_input.name + " is not mapped");
                }


                var found_action = false;
                path_index = 0;
                for (var i = 0; i < unseal_proof_action_paths.length; i++) {
                    var unseal_proof_action_path = unseal_proof_action_paths[i];
                    for (var j = 0; j < unseal_proof_action_path.length; j++) {
                        var unseal_proof_action = unseal_proof_action_path[j];
                        if (unseal_proof_action.action === ACTION_STATIC_INPUT_FROM_USER) {
                            if (unseal_proof_action.params.module_input_key === user_input.name) {
                                found_action = true;
                                // Properly update the actual action in the array
                                unseal_proof_action_paths[i][j] = {
                                    action: ACTION_STATIC_INPUT,
                                    params: {
                                        public_input_index: user_input.signal_indexes[0],
                                        value: toPaddedHex(input_mapping[user_input.name], 32),
                                    }
                                };
                            }
                        }
                    }
                    if (!found_action) {
                        throw new Error("User input " + user_input.name + " is not a static input from user");
                    }
                }
            }
        }
        var path_index = 0;
        for (var datastream_path of this.data_streams) {
            for (var datastream of datastream_path) {



                //if(unseal_proof_action.params.datastream_id === datastream.datastream_id) {

                if (data_stream_mapping[datastream.datastream_id] === undefined) {
                    throw new Error("Data stream " + datastream.datastream_id + " is not mapped");
                }
                unseal_proof_action_paths[path_index].push({
                    action: ACTION_VALIDATE_DATA_ROOT,
                    params: {
                        address: data_stream_mapping[datastream.datastream_id],

                        output_signal_index: datastream.output_signal_index,
                        output_proof_index: datastream.output_proof_index,
                    }
                });
                //}


            }
            path_index += 1;
        }

        this.unsealProofActions = unseal_proof_action_paths;
    }

    getAllDataStreams(): string[] {
        var data_streams: Set<string> = new Set();
        for (var unseal_proof_action_path of this.unsealProofActions) {
            for (var unseal_proof_action of unseal_proof_action_path) {
                if (unseal_proof_action.action === ACTION_VALIDATE_DATA_ROOT) {
                    data_streams.add(unseal_proof_action.params.address);
                }
            }
        }
        return Array.from(data_streams);


    }


    getUnsealProofActions(): UnsealProofAction[][] {
        return this.unsealProofActions;
    }
    getExpectedInputs(): string[] {
        return Array.from(new Set(this.user_inputs.flat().map((user_input) => user_input.name)));
    }

    async getUnsealRootForProof(proof_index: number): Promise<ProofPath> {
        //We just re-calculate the tree
        var tree = await createKeccakMerkelTree(20, [])
        for (var unseal_proof_action_path of this.unsealProofActions) {
            tree.insert(await ChainedProof.calculateUnsealRoot(unseal_proof_action_path));
        }
        console.log("Path: " + tree.path(proof_index + 1));
        console.log("Root: " + tree.root.toString());
        return tree.path(proof_index + 1);
    }
    async getUnsealRoot(): Promise<string> {

        var tree = await createKeccakMerkelTree(20, [])
        for (var unseal_proof_action_path of this.unsealProofActions) {
            var toInsert = await ChainedProof.calculateUnsealRoot(unseal_proof_action_path);
            console.log("Inserting " + toInsert + " at index " + tree.elements.length);

            tree.insert(toInsert);
            console.log("New root: " + tree.root.toString());

        }
        //return await ChainedProof.calculateUnsealRoot(this.unsealProofActions);
        
        return tree.root.toString();
    }

}