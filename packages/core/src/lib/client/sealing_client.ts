import { ProcessorEndpoint } from "../../types/protocol/common";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";



/**
 * Primary entry point for Nihilium
 */
export class NihiliumSealingClient {
    
    private processors: ProcessorEndpoint[];
    private unsealConditionTemplate: UnsealConditionTemplate;

    constructor(processors: ProcessorEndpoint[], unsealConditionTemplate: UnsealConditionTemplate) {
        this.processors = processors;
        this.unsealConditionTemplate = unsealConditionTemplate;
    }



    async initialize(secret: bigint, metadata_root: bigint, template_inputs: {[key:string]:any} = {}, data_stream_mapping: {[key:string]:string} = {}): Promise<void> {
        return this.client.initialize(secret, metadata_root, template_inputs, data_stream_mapping);
    }
}