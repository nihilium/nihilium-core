import { ethers, Signer } from "ethers";
import { IDualDataStream } from "../../data_stream/types";
import { CompiledModule, IOMap, ModuleOutputMap, UnsealConditionModule } from "../modules/types";
import { ProofLibraryType } from "../proofs";
import { ModuleLibraryType } from "../modules";



/**
 * Describes the path you are planning to proof
 * It is constructed as a 256 bit number with the first bit being the length of the proof path
 * The remaining 248 bits are the proof path
 * This means there is a limited to the amount of 'forks' you can take in a proof path
 * Which is 248 and should be more than anyone would ever need
 * The proof path is a boolean array of length 248
 
 */
export class UnsealConditionsProofPathDescriptor {
    proof_path_length: number; //1 byte
    proof_path: boolean[]; //248bits
    constructor(){
        this.proof_path_length = 0;
        this.proof_path = [];
    }

}


export function import_collectionnode_from_json(data: any, moduleLibrary: ModuleLibraryType, proofLibrary: ProofLibraryType): CollectionNode {
    
    return new CollectionNode(data.node_id, new moduleLibrary.standard[data.module_name](proofLibrary), data.public_inputs);
}

export class CollectionNode {
    node_id: string;
    module: UnsealConditionModule;    
    public_inputs: any[];
    constructor(node_id: string, module: UnsealConditionModule, public_inputs: any[]) {
        this.node_id = node_id;
        this.module = module;
        this.public_inputs = public_inputs;
    }

    export_to_json(): any {
        return {
            node_id: this.node_id,
            module_name: this.module.name,
            public_inputs: this.public_inputs,
        };
    }

    get_outputs(): ModuleOutputMap {
        return this.module.getOutputs();
    }

    get_output_keys(): string[] {
        return Object.keys(this.get_outputs());
    }
    get_input_keys(): string[] {
        return Object.keys(this.module.getUserInputs());
    }
    validate_input_mapping(input_mapping: {[key: string]: any}): boolean {
        return this.module.validateInputs(input_mapping);
    }
}

export enum CollectionEdgeInput {
    
    //link = "link",//Simple link to define ordering
    signal_pass = "signal_pass",
    static_input = "static_input",    
    user_input = "user_input"//becomes a static input during compilation
}

export function import_collectionedge_from_json(data: any, nodes: {[key: string]: CollectionNode}): CollectionEdge {
    return new CollectionEdge(data.from_node_id ? nodes[data.from_node_id] : undefined,
         nodes[data.to_node_id], data.mapping, data.input_type);
}


export class CollectionDataStream {
    //Unique identifier for the data stream
    //Used for mapping datastream inputs
    datastream_id: string;
    from: CollectionNode;
    
    field_name: string; //Key is the from node output key, the value node to input key
    
    constructor(datastream_id: string, from: CollectionNode, field_name: string) {
        this.datastream_id = datastream_id;

        this.from = from;
        this.field_name = field_name;
    }

    export_to_json(): any {
        return {
            datastream_id: this.datastream_id,
            from_node_id: this.from?.node_id,
            field_name: this.field_name,
        };
    }
    


}

export class CollectionEdge {
    edge_id: string;
    from: CollectionNode|undefined;
    to: CollectionNode;
    mapping: [string, string|any]; //Key is the from node output key, the value node to input key
    input_type: CollectionEdgeInput;
    constructor( from: CollectionNode|undefined, to: CollectionNode, mapping: [string, any], input_type: CollectionEdgeInput, edge_id: string = "") {
        this.edge_id = edge_id;

        this.from = from;
        this.to = to;
        this.mapping = mapping;
        if(edge_id == ""){
            this.edge_id = this.from?.node_id + "_" + this.to.node_id + "_" + this.mapping[0] + "_" + this.mapping[1];
        }
        this.input_type = input_type;
        if(!this.validate_inputs()) {
            throw new Error("Invalid module edge");
        }
    }
    toShortNodeId(node_id: string | undefined): string {
        if(node_id === undefined) {
            return "undefined";
        }
        var parts = node_id.split("_");
        return parts[0].substring(0, 6) + "_" + parts[1];
    }
    toString(): string {
        if(this.input_type === CollectionEdgeInput.signal_pass) {
            return this.toShortNodeId(this.from?.node_id) + " -> " + this.toShortNodeId(this.to.node_id) + " [" + this.mapping[0] + " -> " + this.mapping[1] + "] (signal_pass)";
        }
        if(this.input_type === CollectionEdgeInput.static_input) {
            return this.toShortNodeId(this.from?.node_id) + " -> " + this.toShortNodeId(this.to.node_id) + " [" + this.mapping[0] + " -> " + this.mapping[1] + "] (static_input)";
        }
        if(this.input_type === CollectionEdgeInput.user_input) {
            return this.toShortNodeId(this.from?.node_id) + " -> " + this.toShortNodeId(this.to.node_id) + " [" + this.mapping[0] + " -> " + this.mapping[1] + "] (user_input)";
        }
        return this.edge_id;
    }

    export_to_json(): any {
        return {
            edge_id: this.edge_id,
            from_node_id: this.from?.node_id,
            to_node_id: this.to.node_id,    
            mapping: this.mapping,
            input_type: this.input_type,
        };
    }
    validate_inputs(): boolean {
        if(this.mapping[0] === undefined || this.mapping[1] === undefined) {
            return false;
        }
        if(this.input_type === "signal_pass") {
            if(this.from === undefined) {
                console.error("From is undefined");
                return false;
            }
            if(!this.from.get_output_keys().includes(this.mapping[0])) {
                console.error("From output key not found");
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                console.error("To input key not found");
                return false;
            }
            return true;
        }
        if(this.input_type === "static_input") {
            if(this.from !== undefined) {
                console.error("From is not undefined");
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                console.error("To input key not found");
                return false;
            }
            return true;
        }
        if(this.input_type === "user_input") {
            if(this.from !== undefined) {
                console.error("From is not undefined");
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                console.error("To input key not found");
                return false;
            }
            return true;
        }
        
        if(this.input_type === "link") {
            // Link edges require a from node to define ordering
            if(this.from === undefined) {
                console.error("From is undefined for link edge");
                return false;
            }
            if(this.to === undefined) {
                console.error("To is undefined for link edge");
                return false;
            }
            return true;
        }
        return false;
    }


}

export enum ChangedType {
    removed = "removed",
    added = "added",
    modified = "modified",
    moved = "moved",
}
export type ChangedCallback = (changes: {
    action: ChangedType,
    nodes?: CollectionNode[],
    edges?: CollectionEdge[],
    data_streams?: CollectionDataStream[],
    starting_node?: CollectionNode|undefined,
    comments?: {[key: string]: string},
    named_forks?: {[key: string]: number},
}) => void;


// export class RequiredUserInput { 
//     proof_index: number;
//     signal_indexes: [number, number];
//     name: string;
//     module_id: string;
//     description: string;
//     input_signal_name: string;
    
//     constructor(data: Omit<RequiredUserInput, 'input_signal_name'>) {
//         this.proof_index = data.proof_index;
//         this.signal_indexes = data.signal_indexes;
//         this.name = data.name;
//         this.module_id = data.module_id;
//         this.description = data.description;
//         this.input_signal_name = this.module_id + ":" + this.name;
//     }
    
// }

export type RequiredUserInput = { 
    proof_index: number;
    signal_indexes: [number, number];
    name: string;
    module_id: string;
    description: string;
    input_signal_name: string;
}


export type DataStreamInput = { 
    datastream_id: string;
    output_proof_index: number;
    output_signal_index: number;
    
}

export type CompiledCollectionExport = {
    // 256 bits, a 1 represents a proof must be true, a 0 represents a proof must be false
    named_forks: {[key: string]: number};
    compiled_modules: CompiledModule[][];
    user_inputs: RequiredUserInput[][];
    data_stream_inputs: DataStreamInput[][];
    collection_id: string;
    collection_export: any;
}

export interface AddressMap {
    getAddress(key: string): string;
}

export class BasicAddressMap implements AddressMap {
    address_map: {[key: string]: string};
    constructor(address_map: {[key: string]: string}) {
        this.address_map = address_map;
    }
    getAddress(key: string): string {
        return this.address_map[key];
    }
    addAddress(key: string, address: string): void {
        this.address_map[key] = address;
    }
}

export class AddressMapWithDefault implements AddressMap {
    address_map: {[key: string]: string};
    default_address: string;
    constructor(address_map: {[key: string]: string}, default_address: string) {
        this.address_map = address_map;
        this.default_address = default_address;
    }
    getAddress(key: string): string {
        return this.address_map[key] || this.default_address;
    }
}