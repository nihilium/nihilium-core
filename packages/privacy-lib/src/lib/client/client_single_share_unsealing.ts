

import { IClientSingleShareUnsealingProcess, ProcessorEndpoint, ProcessorStatus, PROTOCOL_PROCESSOR_PATHS, SingleSealStoragePackage, SingleUnsealRequest, SingleSealUnsealRequestResponse, UnsealingStatus } from "../../types/protocol/common";
import { EnvSettings, get_env_settings } from "../../env_settings";
import { IDataStream } from "../data_stream/types";
import axios from "axios";
import { cryptoTools } from "@nihilium/zkp-circuits";
import { ChainedProofCollection } from "../reveal_methods/collections/types";

import { hexToBytes } from "@noble/hashes/utils";


export type UnsealingState = { 
    phase: UnsealingStatus
    seal: SingleSealStoragePackage,
    unseal_response?: SingleSealUnsealRequestResponse
    data_stream_id?: string
    data_stream_local_index?: number
    data_stream_global_index?: number
}

export class ClientSingleShareUnsealingProcess implements IClientSingleShareUnsealingProcess {
   
    private processor: ProcessorEndpoint;
    private phase: UnsealingStatus;
    private seal: SingleSealStoragePackage;
    private dataStreams: IDataStream[];
    private unsealingState: UnsealingState;
    private chainedProofCollection: ChainedProofCollection;
    private storageKey: string;
    private awaiting_reveal_value_to_be_provable: boolean;
    constructor(
        processor: ProcessorEndpoint,
        chainedProofCollection: ChainedProofCollection,
        seal: SingleSealStoragePackage
    ) {
        this.processor = processor;
        this.seal = seal;
        this.chainedProofCollection = chainedProofCollection;
        this.phase = UnsealingStatus.NOT_STARTED;
        this.dataStreams = this.chainedProofCollection.getDatastreams();
        this.awaiting_reveal_value_to_be_provable = false;
        // Generate a unique storage key based on the seal address
        this.storageKey = `unsealing_state_${seal.public_package.address}`;
        
        this.unsealingState = {
            phase: UnsealingStatus.NOT_STARTED,
            seal: seal,
            unseal_response: undefined
        }
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
        var isProvable = await this.validate_elligble_for_unsealing();
        if(isProvable) {
            if(callback) {
                callback();
            }
            break;
        }
    }
}

    async validate_elligble_for_unsealing(): Promise<boolean> {
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
        var isProvable = await this.validate_elligble_for_unsealing();
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

    async get_unseal_request(): Promise<SingleUnsealRequest> {
        if(this.phase != UnsealingStatus.REVEAL_VALUE_EXPOSED) {
            throw new Error("Unseal request can only be produced in the initial reveal condition exposed phase")
        }
        var proofs = await this.chainedProofCollection.produce_proofs(this.dataStreams[0], this.processor, hexToBytes(this.seal.private_package.proof), this.seal.private_package.public_signals)
        
        return  {
            address: this.seal.public_package.address,
            circuit_id: this.seal.public_package.circuit_id,
            proof: this.seal.private_package.proof,
            //public_signals: this.seal.private_package.public_signals,
            public_key: [this.processor.public_he_encryption_key[0].toString(), this.processor.public_he_encryption_key[1].toString()],
            signature_S: "0",
            signature_R8x: "0",
            signature_R8y: "0",
            proofs: proofs.proofs.map(proof => cryptoTools.uint8ArrayToHex(proof)),
            public_signals: proofs.public_inputs,
            data_stream_address: this.dataStreams[0].getAddress(),
            unseal_proof_actions: this.chainedProofCollection.getUnsealProofActions()
        }
    }

    async unseal_request_to_processor(): Promise<SingleSealUnsealRequestResponse> {
        //Always needs to be called live due to the fact of rolling over merkle roots in the data stream
        var unseal_request = await this.get_unseal_request();
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

    async start_unsealing(send_to_processor: boolean = true): Promise<SingleUnsealRequest> {
        var toReturn:SingleUnsealRequest = await this.get_unseal_request();
        if(send_to_processor) {
            const response = await axios.post<SingleSealUnsealRequestResponse>(
                this.processor.url + PROTOCOL_PROCESSOR_PATHS.REQUEST_UNSEAL, toReturn)
            if(response.status != 200) {
                throw new Error("Failed to request unseal");
            }
            this.phase = UnsealingStatus.UNSEALING_IN_PROGRESS;
            this.saveStateToLocalStorage();
        }
        
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