import { ProofLibraryType } from "../proofs";
import { ModuleLibraryType, UnsealConditionModule } from "../modules";
import { CompiledCollectionExport, DataStreamInput, RequiredUserInput } from "./types";
import { UnsealProofAction } from "../types";
import { ACTION_STATIC_INPUT_FROM_USER, ACTION_VALIDATE_DATA_ROOT, ACTION_VALIDATE_DATA_ROOT_FROM_USER_INPUT, ChainedProofV2 as ChainedProof } from "../ChainedProofV2";
import { ACTION_STATIC_INPUT, ACTION_PREPARE_NEXT_PROOF, ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL } from "../ChainedProofV2";
import { toPaddedHex } from "../../utils";
import { createKeccakMerkelTree } from '../../utils';
import { UnsealConditionTemplateExport } from "../../../types/protocol/common";
import { ProofPath } from "fixed-merkle-tree";
import { UnsealConditionProof } from "../proofs/types";


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
    private proofs_cache: { [key: string]: UnsealConditionProof } = {};
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


    private getInputFromMapping(input_mapping: { [key: string]: bigint }, input:RequiredUserInput): bigint {
        if(input.module_id + ":" + input.name in input_mapping) {
            return input_mapping[input.module_id + ":" + input.name];
        }
        if(input_mapping[input.name] === undefined) {
            throw new Error("Input " + input.name + " is not mapped");
        }
        return input_mapping[input.name];
    }

    compile(input_mapping: { [key: string]: bigint }, 
        data_stream_mapping: { [key: string]: string },
        optimize: boolean = true): void {
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
                //Throws if not set
                this.getInputFromMapping(input_mapping, user_input);


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
                                        value: toPaddedHex(this.getInputFromMapping(input_mapping, user_input), 32),
                                    }
                                };
                                //TODO fix now with the same 
                                //we break because of multiple inputs with the same name
                                break;
                            }else{
                                console.log("User input " + user_input.name + " is not a static input from user for action ", unseal_proof_action);
                                console.log(this.user_inputs)
                            }
                        }
                    }
                    if (!found_action) {
                       // throw new Error("User input " + user_input.name + " is not a static input from user");
                    }else{
                        break;
                    }
                }
            }
        }
        //Sanity check that all user inputs are set
        for (var i = 0; i < unseal_proof_action_paths.length; i++) {
            var unseal_proof_action_path = unseal_proof_action_paths[i];
            for (var j = 0; j < unseal_proof_action_path.length; j++) {
                if(unseal_proof_action_path[j].action === ACTION_STATIC_INPUT_FROM_USER) {
                    throw new Error(`User input input not set ${unseal_proof_action_path[j].params.module_input_key}`);
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
        if(optimize) {
        var optimized_unseal_proof_actions: UnsealProofAction[][] = [];
            for(var unseal_proof_action_path of this.unsealProofActions) {
                optimized_unseal_proof_actions.push(this.optimize(unseal_proof_action_path));
            }
            this.unsealProofActions = optimized_unseal_proof_actions;
        }
    }

    address_to_proof(address: string): UnsealConditionProof {
        if(this.proofs_cache[address] !== undefined) {
            return this.proofs_cache[address];
        }
        for (var proofPath of this.compiled_collection.compiled_modules) {
            for (var module of proofPath) {
                var actualModule = this.module_library.getModule(module.module_name, this.proof_library);
                var i = 0;
                for (var action of module.actions) {
                    if (action.action === ACTION_VALIDATE_DATA_ROOT) {
                        if (action.params.address === address) {
                            
                            this.proofs_cache[address] = actualModule.getProofByIndex(i).proof;
                            return this.proofs_cache[address];
                        }
                    }
                    i += 1;
                }
            }
        }
        throw new Error("Proof " + address + " not found");
    }

    /**
     * Converts V1 unseal proof actions (2D output references via output_proof_index + output_signal_index)
     * into V2 actions (flat output list with bitmask-based pruning at each chain_proof_verify).
     *
     * At each chain_proof_verify:
     *   1. Append the new proof's outputs to the flat list
     *   2. Look forward to find which flat entries are still referenced
     *   3. Build a bitmask (1=keep, 0=remove) over the entire flat list
     *   4. Prune dead entries
     *
     * PASS_SIGNAL and VALIDATE_DATA_ROOT actions are converted from 2D (proof_index, signal_index)
     * to flat indices into the current output list.
     */
    optimize(unseal_proof_actions: UnsealProofAction[]): UnsealProofAction[] {
        const result: UnsealProofAction[] = [];

        // Each entry tracks its old V1 identity so we can resolve 2D references
        type FlatEntry = { proofIndex: number; signalOffset: number };
        let flatList: FlatEntry[] = [];

        let currentVerifierAddress = "";
        let proofIndex = 0;

        for (let i = 0; i < unseal_proof_actions.length; i++) {
            const action = unseal_proof_actions[i];

            if (action.action === ACTION_PREPARE_NEXT_PROOF) {
                currentVerifierAddress = action.params.verifier_address;
                result.push(action);
            }
            else if (action.action === ACTION_CHAIN_PROOF_VERIFY) {
                // Step 1: Determine how many outputs this proof produces
                const proof = this.getProofByVerifierAddress(currentVerifierAddress);
                const outputSize = proof.getOutputSize();

                // Step 2: Append new outputs to the flat list
                for (let s = 0; s < outputSize; s++) {
                    flatList.push({ proofIndex, signalOffset: s });
                }

                // Step 3: Scan all future actions to find which flat entries are still referenced
                const referencedFlatIndices = this.collectFutureReferences(
                    unseal_proof_actions, i + 1, flatList
                );

                // Step 4: Build bitmask over the entire flat list (1=keep, 0=remove)
                let maskBigInt = BigInt(0);
                for (let k = 0; k < flatList.length; k++) {
                    if (referencedFlatIndices.has(k)) {
                        maskBigInt |= BigInt(1) << BigInt(k);
                    }
                }

                // Step 5: Prune dead entries from the flat list
                flatList = flatList.filter((_, idx) => referencedFlatIndices.has(idx));

                // Step 6: Emit V2 verify action with the computed mask
                result.push({
                    action: ACTION_CHAIN_PROOF_VERIFY,
                    params: {
                        mask: toPaddedHex(maskBigInt, 32),
                    },
                });

                proofIndex++;
            }
            else if (action.action === ACTION_PASS_SIGNAL) {
                // Convert the 2D source reference to a flat index
                const oldProofIdx: number = action.params.output_proof_index;
                const oldSigStart: number = action.params.output_signal_indexes[0];
                const sigLen: number = action.params.output_signal_indexes[1];

                const flatStart = flatList.findIndex(e =>
                    e.proofIndex === oldProofIdx && e.signalOffset === oldSigStart
                );
                if (flatStart === -1) {
                    throw new Error(
                        `Optimize: PASS_SIGNAL output reference not found in flat list: proof=${oldProofIdx}, signal=${oldSigStart}`
                    );
                }

                // Emit V2 pass signal with flat output_signal_indexes (no output_proof_index)
                result.push({
                    action: ACTION_PASS_SIGNAL,
                    params: {
                        public_input_indexes: action.params.public_input_indexes,
                        output_signal_indexes: [flatStart, sigLen],
                    },
                });
            }
            else if (action.action === ACTION_VALIDATE_DATA_ROOT) {
                // Convert the 2D reference to a flat index
                const oldProofIdx: number = action.params.output_proof_index;
                const oldSigIdx: number = action.params.output_signal_index;

                const flatIdx = flatList.findIndex(e =>
                    e.proofIndex === oldProofIdx && e.signalOffset === oldSigIdx
                );
                if (flatIdx === -1) {
                    throw new Error(
                        `Optimize: VALIDATE_DATA_ROOT output reference not found in flat list: proof=${oldProofIdx}, signal=${oldSigIdx}`
                    );
                }

                // Emit V2 validate data root with flat output_signal_index (no output_proof_index)
                result.push({
                    action: ACTION_VALIDATE_DATA_ROOT,
                    params: {
                        address: action.params.address,
                        output_signal_index: flatIdx,
                    },
                });
            }
            else {
                // STATIC_INPUT and others pass through unchanged
                result.push(action);
            }
        }

        return result;
    }

    /**
     * Scans actions from startIdx onward to find which flat list entries
     * are referenced by future PASS_SIGNAL and VALIDATE_DATA_ROOT actions.
     * Returns the set of flat indices that are still needed.
     */
    private collectFutureReferences(
        actions: UnsealProofAction[],
        startIdx: number,
        flatList: { proofIndex: number; signalOffset: number }[],
    ): Set<number> {
        const referenced = new Set<number>();

        for (let j = startIdx; j < actions.length; j++) {
            const action = actions[j];

            if (action.action === ACTION_PASS_SIGNAL) {
                const proofIdx: number = action.params.output_proof_index;
                const sigStart: number = action.params.output_signal_indexes[0];
                const sigLen: number = action.params.output_signal_indexes[1];

                for (let k = 0; k < sigLen; k++) {
                    const fi = flatList.findIndex(e =>
                        e.proofIndex === proofIdx && e.signalOffset === sigStart + k
                    );
                    if (fi !== -1) referenced.add(fi);
                }
            }
            else if (action.action === ACTION_VALIDATE_DATA_ROOT) {
                const proofIdx: number = action.params.output_proof_index;
                const sigIdx: number = action.params.output_signal_index;

                const fi = flatList.findIndex(e =>
                    e.proofIndex === proofIdx && e.signalOffset === sigIdx
                );
                if (fi !== -1) referenced.add(fi);
            }
        }

        return referenced;
    }

    /**
     * Finds an UnsealConditionProof by its on-chain verifier address.
     * Searches through compiled modules to match the verifier_address
     * in PREPARE_NEXT_PROOF actions to the corresponding proof.
     */
    private getProofByVerifierAddress(verifier_address: string): UnsealConditionProof {
        for (const modulePath of this.compiled_collection.compiled_modules) {
            for (const compiledModule of modulePath) {
                const actualModule = this.module_library.getModule(
                    compiledModule.module_name, this.proof_library
                );
                let proofIdx = 0;
                for (const action of compiledModule.actions) {
                    if (action.action === ACTION_PREPARE_NEXT_PROOF) {
                        if (action.params.verifier_address === verifier_address) {
                            return actualModule.getProofByIndex(proofIdx).proof;
                        }
                        proofIdx++;
                    }
                }
            }
        }
        throw new Error("Proof with verifier address " + verifier_address + " not found");
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
        return Array.from(new Set(this.user_inputs.flat().map((user_input) => user_input.input_signal_name)));
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