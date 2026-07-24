import { HexString, ProcessorEndpoint } from "../../types/protocol/common";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { ClientSingleShareSealingProcess } from "./client_single_share_sealing";
import { PaymentProvider, NihiliumPaymentProviderUnauthenticated } from "./payments";
import { NihiliumEncryptionMode } from "./types";



export enum NihiliumSealingStatus {
    Ready_to_seal = "ready_to_seal",
    Paying_for_seal = "paying_for_seal",
    Payment_failed = "payment_failed",
    Requesting_commitments = "requesting_commitments",
    Producing_proofs = "producing_proofs",
    Producing_threshold_encryptions = "producing_threshold_encryptions",

    Sealed = "sealed",
    Failed = "failed",

 }

 type SealingState = {
    status: NihiliumSealingStatus;
    processor_endpoints: ProcessorEndpoint[];
    single_seal_processes: ClientSingleShareSealingProcess[];
    shared_unseal_template: UnsealConditionTemplate;
    shared_unseal_condition_root: HexString;
    shared_metadata_root: HexString;
    shared_proving_hints: any;
    shared_encryption_mode: NihiliumEncryptionMode;
    shared_search_width: number;
    shared_threshold: number;
    shared_paymentProvider: PaymentProvider;
 }


/**
 * Primary entry point for Nihilium
 */
export class NihiliumSealingClient {
    
    private processors: ProcessorEndpoint[];
    private unsealConditionTemplate: UnsealConditionTemplate;
    private threshold: number;
    private search_width: number;
    private status: NihiliumSealingStatus;
    private encryption_mode: NihiliumEncryptionMode;
    private paymentProvider: PaymentProvider;
    private state?: SealingState;
//FDTEncrypt
    constructor(
        processors: ProcessorEndpoint[],         
        unsealConditionTemplate: UnsealConditionTemplate,
        threshold: number,
        paymentProvider: PaymentProvider = new NihiliumPaymentProviderUnauthenticated(),
        encryption_mode: NihiliumEncryptionMode = NihiliumEncryptionMode.OneTimeSingleAesEncryption,
        search_width: number = 1) {
            if (threshold > processors.length) {
                throw new Error("Threshold is greater than the number of processors");
            }
            if (threshold < 1) {
                throw new Error("Threshold is less than 1");
            }
            if (search_width < 1) {
                throw new Error("Search width m must be at least 1");
            }
        this.processors = processors;
        this.unsealConditionTemplate = unsealConditionTemplate;
        this.threshold = threshold;
        this.search_width = search_width;
        this.encryption_mode = encryption_mode;
        this.paymentProvider = paymentProvider;
        this.status = NihiliumSealingStatus.Ready_to_seal;
    }
    load_sealing_state(state: SealingState): void {
        this.state = state;
    }
    save_sealing_state(): SealingState {
        if(!this.state) {
            throw new Error("No sealing state to save");
        }
        return this.state;
    }
    
    async start_sealing(): Promise<void> {
        if(!this.state) {
            this.state = {
                status: NihiliumSealingStatus.Ready_to_seal,
                processor_endpoints: this.processors,
                single_seal_processes: [],
                shared_unseal_template: this.unsealConditionTemplate,
                shared_unseal_condition_root: "",
                shared_metadata_root: "",
                shared_proving_hints: {},
                shared_encryption_mode: this.encryption_mode,
                shared_search_width: this.search_width,
                shared_threshold: this.threshold,
                shared_paymentProvider: this.paymentProvider,
            }
        }
        this.state.status = NihiliumSealingStatus.Paying_for_seal;
        this.status = NihiliumSealingStatus.Paying_for_seal;
        for(const processor of this.state.processor_endpoints) {
            const single_seal_process = new ClientSingleShareSealingProcess(processor, this.unsealConditionTemplate, this.threshold, this.search_width, this.encryption_mode, this.paymentProvider);
            await single_seal_process.initialize(secret, metadata_root, template_inputs, data_stream_mapping);
           
            this.state.single_seal_processes.push(single_seal_process);
        }
    }

    
}