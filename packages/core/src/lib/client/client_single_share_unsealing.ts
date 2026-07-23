

import { IClientSingleShareUnsealingProcess, ProcessorEndpoint, ProcessorStatus, PROTOCOL_PROCESSOR_PATHS, SingleSealStoragePackage, SingleUnsealRequest, SingleSealUnsealRequestResponse, UnsealingStatus } from "../../types/protocol/common";
import { EnvSettings, get_env_settings } from "../../env_settings";
import { IDualDataStream } from "../data_stream/types";
import axios from "axios";
import { cryptoTools } from "@nihilium/zkp-circuits";
// import { ChainedProofCollection } from "../unseal_conditions/types";
import { UnsealConditionCollection } from "../unseal_conditions/collections/UnsealConditionCollection";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { hexToBytes } from "@noble/hashes/utils";
import { CompiledModule, ModuleProof, ProofProductionContext, UnsealConditionModule } from "../unseal_conditions/modules";


export type UnsealingState = {
    phase: UnsealingStatus
    seal: SingleSealStoragePackage,
    unseal_response?: SingleSealUnsealRequestResponse
    data_stream_id?: string
    data_stream_local_index?: number
    data_stream_global_index?: number
}

/**
 * Supplies a module's external inputs (the app-owned, irreducible parts such as a ZKEmail
 * proof) during unseal proof production. Keyed by CompiledModule.module_id (with module_name
 * as a fallback) so it works with modules the SDK does not know at compile time.
 */
export type UnsealResolver = (
    module: UnsealConditionModule,
    compiled_module: CompiledModule,
) => Promise<{ [key: string]: any }> | { [key: string]: any };

export type UnsealResolvers = { [moduleIdOrName: string]: UnsealResolver };

/** Lifecycle phase of a module during unseal proof production, emitted via on(). */
export enum UnsealModulePhase {
    Producing = "producing",
    Produced = "produced",
    Failed = "failed",
}

export type UnsealModuleEvent = {
    proof_index: number;
    module_id: string;
    module_name: string;
    phase: UnsealModulePhase;
    error?: unknown;
};

/** Error thrown by the driver, tagged with the module that failed. */
export class UnsealModuleError extends Error {
    constructor(public module_id: string, public module_name: string, message: string) {
        super(`Module ${module_name} (${module_id}): ${message}`);
        this.name = "UnsealModuleError";
    }
}

export class ClientSingleShareUnsealingProcess implements IClientSingleShareUnsealingProcess {
   
    public processor: ProcessorEndpoint;
    public phase: UnsealingStatus;
    private seal: SingleSealStoragePackage;
    public dataStreams: IDualDataStream[] = [];
    public unsealingState: UnsealingState;
    public unsealConditionCollection: UnsealConditionCollection;
    public unsealConditionTemplate: UnsealConditionTemplate;
    private storageKey: string;
    private awaiting_reveal_value_to_be_provable: boolean;
    constructor(
        processor: ProcessorEndpoint,
        unsealConditionCollection: UnsealConditionCollection,
        unsealConditionTemplate: UnsealConditionTemplate,
        data_stream_mapping: {[address:string]:IDualDataStream},
        seal: SingleSealStoragePackage
    ) {
        this.processor = processor;
        this.seal = seal;
        this.unsealConditionCollection = unsealConditionCollection;
        this.phase = UnsealingStatus.NOT_STARTED;
        this.unsealConditionTemplate = unsealConditionTemplate;
        if(!unsealConditionTemplate.isCompiled()) {
            throw new Error("Unseal condition template not compiled");
        }
        for(var data_stream_address of this.unsealConditionTemplate.getAllDataStreams()) {
            if(data_stream_mapping[data_stream_address] === undefined) {
                throw new Error("Data stream " + data_stream_address + " is not mapped");
            }
            this.dataStreams.push(data_stream_mapping[data_stream_address]);
        }
        
        this.awaiting_reveal_value_to_be_provable = false;
        // Generate a unique storage key based on the seal address
        this.storageKey = `unsealing_state_${seal.public_package.address}`;
        
        this.unsealingState = {
            phase: UnsealingStatus.NOT_STARTED,
            seal: seal,
            unseal_response: undefined
        }
    }

    /**
     * Options-object factory. Builds the {[address]: dataStream} map from the dataStreams
     * array and runs initialize().
     */
    static async create(opts: {
        processor: ProcessorEndpoint;
        collection: UnsealConditionCollection;
        template: UnsealConditionTemplate;
        dataStreams: IDualDataStream[];
        seal: SingleSealStoragePackage;
    }): Promise<ClientSingleShareUnsealingProcess> {
        const mapping: { [address: string]: IDualDataStream } = {};
        for (const dataStream of opts.dataStreams) {
            mapping[dataStream.getAddress()] = dataStream;
        }
        const process = new ClientSingleShareUnsealingProcess(
            opts.processor, opts.collection, opts.template, mapping, opts.seal,
        );
        await process.initialize();
        return process;
    }

    getModulesForPath(proof_index: number): {compiled_module: CompiledModule, module: UnsealConditionModule}[] {
        var toReturn: {compiled_module: CompiledModule, module: UnsealConditionModule}[] = [];

        for(var module of this.unsealConditionTemplate.compiled_collection.compiled_modules[proof_index]) {
            toReturn.push({compiled_module: module,
                module: this.unsealConditionTemplate.module_library.getModule(module.module_name,
                    this.unsealConditionTemplate.proof_library)});
        }
        return toReturn;
    }

    // ---- Fork driver ---------------------------------------------------------------
    // Completed module proofs, keyed by module_id, so a retry re-runs only failed modules.
    private producedProofs: { [module_id: string]: ModuleProof } = {};
    private moduleListeners: ((event: UnsealModuleEvent) => void)[] = [];

    /**
     * Enumerate the unseal paths (forks) this template exposes. Each fork is its own ordered
     * module flow; the caller picks one by index and passes it to runPath.
     */
    paths(): { index: number }[] {
        return this.unsealConditionTemplate.compiled_collection.compiled_modules.map(
            (_: unknown, index: number) => ({ index })
        );
    }

    /** Subscribe to per-module lifecycle events (structured progress). */
    on(listener: (event: UnsealModuleEvent) => void): void {
        this.moduleListeners.push(listener);
    }

    private emitModule(event: UnsealModuleEvent): void {
        for (const listener of this.moduleListeners) {
            try { listener(event); } catch { /* listener errors must not break production */ }
        }
    }

    /**
     * Produce every proof for one fork, in template order, and return the assembled
     * proofs/public_inputs. Transport-agnostic: the caller then feeds the result to
     * get_unseal_request (in-process) or unseal_request_to_processor (HTTP).
     *
     * Modules that declare productionInputs() require a resolver (keyed by module_id, with
     * module_name as fallback) supplying those external inputs; context-only modules (e.g.
     * the opening module) run with no resolver. Completed proofs are memoized so a retry
     * after a transient failure re-runs only the failed modules.
     */
    async runPath(
        proof_index: number,
        resolvers: UnsealResolvers = {},
    ): Promise<{ proofs: any[]; public_inputs: any[][] }> {
        const modules = this.getModulesForPath(proof_index);
        const ctx: ProofProductionContext = {
            dataStreams: this.dataStreams,
            processor: this.processor,
            seal: this.seal,
            upstream: {},
        };
        const proofs: any[] = [];
        const public_inputs: any[][] = [];

        for (const { compiled_module, module } of modules) {
            const module_id = compiled_module.module_id;
            const module_name = compiled_module.module_name;

            let result = this.producedProofs[module_id];
            if (!result) {
                const requiredInputs = Object.keys(module.productionInputs());
                const resolver = resolvers[module_id] ?? resolvers[module_name];
                if (requiredInputs.length > 0 && !resolver) {
                    throw new UnsealModuleError(module_id, module_name,
                        `requires external inputs (${requiredInputs.join(", ")}) but no resolver was provided`);
                }
                const inputs = resolver ? await resolver(module, compiled_module) : {};
                this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Producing });
                try {
                    result = await module.produce(ctx, inputs);
                } catch (error) {
                    this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Failed, error });
                    if (error instanceof UnsealModuleError) throw error;
                    throw new UnsealModuleError(module_id, module_name,
                        error instanceof Error ? error.message : String(error));
                }
                this.producedProofs[module_id] = result;
                this.emitModule({ proof_index, module_id, module_name, phase: UnsealModulePhase.Produced });
            }

            ctx.upstream[module_id] = result;
            proofs.push(...result.proofs);
            public_inputs.push(...result.public_inputs);
        }

        return { proofs, public_inputs };
    }

    private isLocalStorageAvailable(): boolean {
        try {
            return typeof window !== 'undefined' && window.localStorage !== undefined;
        } catch {
            return false;
        }
    }

    public get_storage_key(): string {
        return this.unsealingState.seal.public_package.reveal_value.toString()
    }

    private saveStateToLocalStorage(): void {
        if (!this.isLocalStorageAvailable()) {
            return;
        }

        try {
            const stateToSave = {
                ...this.unsealingState,
                phase: this.phase
            };
            window.localStorage.setItem(this.get_storage_key(), JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('Failed to save unsealing state to localStorage:', error);
        }
    }

    private loadStateFromLocalStorage(): UnsealingState | null {
        if (!this.isLocalStorageAvailable()) {
            return null;
        }

        try {
            const savedState = window.localStorage.getItem(this.get_storage_key());
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                return parsedState;
            }
        } catch (error) {
            console.warn('Failed to load unsealing state from localStorage:', error);
        }

        return null;
    }

    private clearStateFromLocalStorage(): void {
        if (!this.isLocalStorageAvailable()) {
            return;
        }

        try {
            window.localStorage.removeItem(this.storageKey);
        } catch (error) {
            console.warn('Failed to clear unsealing state from localStorage:', error);
        }
    }

async stop_awaiting_reveal_value_to_be_provable(): Promise<void> {
    this.awaiting_reveal_value_to_be_provable = false;
}

async await_reveal_value_to_be_provable(callback?: () => void): Promise<void> {
    this.awaiting_reveal_value_to_be_provable = true;
    while(this.awaiting_reveal_value_to_be_provable) {
        await new Promise(resolve => setTimeout(resolve, 500));
        var isProvable = await this.reveal_value_published();
        if(isProvable) {
            if(callback) {
                callback();
            }
            break;
        }
    }
}

    async reveal_value_published(): Promise<boolean> {
        //if(this.phase == UnsealingStatus.REVEAL_VALUE_SENT){
            //TODO check other reveal conditions
            var isProvable = await this.dataStreams[0].isProvable(BigInt(this.seal.public_package.reveal_value).toString())
            if(isProvable) {
                this.update_state(UnsealingStatus.REVEAL_VALUE_EXPOSED)
            }
            return isProvable
        //}
    }
    async get_unsealing_status(): Promise<UnsealingStatus> {
        return this.phase
    }
    get_processor_status(): Promise<ProcessorStatus> {
        throw new Error("Method not implemented.");
    }
    display_reveal_conditions(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    async publish_reveal_value(data_stream_id: string = ""): Promise<void> {
       
        if(data_stream_id == "") {
            data_stream_id = this.dataStreams[0].getAddress()
        }
        var isProvable = await this.reveal_value_published();
        if(isProvable) {
           return
        }

        if(this.phase != UnsealingStatus.NOT_STARTED) {
            throw new Error("Reveal value can only be published in the not started phase")
        }

        this.update_state(UnsealingStatus.REVEALING_INITIAL_CONDITION);
        this.dataStreams.forEach(async dataStream => {
            if(dataStream.getAddress() === data_stream_id) {
                //TODO actually do HTTP post
                var index = await dataStream.postData([BigInt(this.seal.public_package.reveal_value).toString()])
                this.unsealingState.data_stream_id = data_stream_id
                this.unsealingState.data_stream_local_index = index[1]
                this.unsealingState.data_stream_global_index = index[0]
                this.saveStateToLocalStorage();
            }
        })
        this.update_state(UnsealingStatus.REVEAL_VALUE_SENT)
    }
    update_state(new_state: UnsealingStatus) {
        this.phase = new_state;
        this.unsealingState.phase = new_state;
        this.saveStateToLocalStorage();
    }

    /**
     * This function is not responsible for producing the proofs, it is only responsible for constructing the unseal request.
     * @param proof_index the index of the proof path to use
     * @param proofs the proofs to use
     * @param public_inputs the public inputs to use
     * @returns the unseal request
     */
    async get_unseal_request(proof_index: number, proofs: any[], public_inputs: any[][]): Promise<SingleUnsealRequest> {
        if(this.phase != UnsealingStatus.REVEAL_VALUE_EXPOSED) {
            throw new Error("Unseal request can only be produced in the initial reveal condition exposed phase")
        }
        //var proofs = await this.un.produce_proofs(this.dataStreams[0], this.processor, hexToBytes(this.seal.private_package.proof), this.seal.private_package.public_signals)
        
        return  {
            address: this.seal.public_package.address,
            circuit_id: this.seal.public_package.circuit_id,
            proof: this.seal.private_package.proof,
            empheral_keys: this.seal.private_package.empheral_keys,
            cyphertexts: this.seal.private_package.cyphertexts,
            //public_signals: this.seal.private_package.public_signals,
            public_key: [this.processor.public_he_encryption_key[0].toString(), this.processor.public_he_encryption_key[1].toString()],
            signature_S: "0",
            signature_R8x: "0",
            signature_R8y: "0",
            proofs: proofs,
            public_signals: public_inputs,
            data_stream_address: this.dataStreams[0].getAddress(),
            unseal_proof_actions: this.unsealConditionTemplate.unsealProofActions[proof_index],
            unseal_root_proof: await this.unsealConditionTemplate.getUnsealRootForProof(proof_index)
        }
    }

    async unseal_request_to_processor(proof_index: number, proofs: any[], public_inputs: any[][]): Promise<SingleSealUnsealRequestResponse> {
        //Always needs to be called live due to the fact of rolling over merkle roots in the data stream
        var unseal_request = await this.get_unseal_request(proof_index, proofs, public_inputs);
        const request_url = this.processor.url + PROTOCOL_PROCESSOR_PATHS.REQUEST_UNSEAL;
        const response = await axios.post<SingleSealUnsealRequestResponse>(
            request_url, unseal_request)
        if(response.status != 200) {
            throw new Error("Failed to request unseal");
        }
        this.unsealingState.unseal_response = response.data;
        this.update_state(UnsealingStatus.UNSEAL_POSSIBLE);
        
        return response.data;
    }

    async start_unsealing(proof_index: number, proofs: any[], public_inputs: any[][]): Promise<SingleUnsealRequest> {
        var toReturn:SingleUnsealRequest = await this.get_unseal_request(proof_index, proofs, public_inputs);
        return toReturn;
    }
    async process_unseal_response(processor_response?: SingleSealUnsealRequestResponse, open_metadata?: (request:bigint) => bigint): Promise<bigint> {
        if(!processor_response) {
            processor_response = this.unsealingState.unseal_response;
        }
        if(!processor_response) {
            throw new Error("No unseal response found");
        }
        var private_scalar = BigInt(processor_response.unpacked_private_scalar)
        if(open_metadata) {
            private_scalar = open_metadata(private_scalar)
        }else{
            var metadata_root_shrinked = cryptoTools.shrinkToBits(BigInt(this.seal.private_package.metadata_root), 247);
            private_scalar = private_scalar - metadata_root_shrinked
        }
        
        
        var result = cryptoTools.decryptECCBabyJub(
            this.seal.private_package.encrypted_secret.ciphertextHex,
            this.seal.private_package.encrypted_secret.R, private_scalar
        )
        
        // Save the unseal response to state and localStorage
        this.unsealingState.unseal_response = processor_response;
        this.update_state(UnsealingStatus.DONE);
        
        return result;
    }

    async initialize(): Promise<void> {
        // Try to load state from localStorage first
        const savedState = this.loadStateFromLocalStorage();
        
        if (savedState) {
            // Restore the saved state
            this.unsealingState = savedState;
            this.phase = savedState.phase;
            console.log('Restored unsealing state from localStorage:', savedState);
        } else {
            // Initialize with default state
            this.update_state(UnsealingStatus.NOT_STARTED);
        }
        
        // this.poseidon = await buildPoseidon();
        // this.env_settings = await get_env_settings();
        // this.babyJub = await buildBabyjub();
        // this.eddsa = await buildEddsa();
    }

    // Method to clear saved state (useful for testing or resetting)
    clearSavedState(): void {
        this.clearStateFromLocalStorage();
    }
}