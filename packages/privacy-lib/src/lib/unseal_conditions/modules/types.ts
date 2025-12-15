import { ACTION_STATIC_INPUT, ACTION_STATIC_INPUT_FROM_USER } from "../ChainedProof";
import { ProofLibraryType } from "../proofs";
import { UnsealConditionProof } from "../proofs/types";
import { UnsealProofAction } from "../types";


export type IOType = "Timestamp" | "BigInt" | "Number" | "String" | "HexString" | "Randomness" | "Other" | IOType[];
export type IO = {
    type_order: IOType[];
    user_input: boolean;        
    description: string;
    required: boolean;
}
export type IOMap = {
    [key: string]: IO;
}

export type CompiledModule = {
    actions: UnsealProofAction[];
}



export class ModuleNode {
    node_id: string;
    proof: UnsealConditionProof;    
    public_inputs: any[];
    constructor(node_id: string, proof: UnsealConditionProof, public_inputs: any[]) {
        this.node_id = node_id;
        this.proof = proof;
        this.public_inputs = public_inputs;
    }

    get_outputs(): {[key: string]: [number, number]} {
        return this.proof.getPublicSignals();
    }

    get_output_keys(): string[] {
        return Object.keys(this.get_outputs());
    }
    get_input_keys(): string[] {
        return this.proof.getProofInputSignalKeys();
    }
    validate_input_mapping(input_mapping: {[key: string]: any}): boolean {
        return this.proof.getProofInputSignalKeys().every(key => input_mapping[key] !== undefined);
    }
}

export enum ModuleEdgeInput {
    signal_pass = "signal_pass",
    static_input = "static_input",
    user_input = "user_input"//becomes a static input during compilation
}

export class ModuleEdge {
    edge_id: string;
    from: ModuleNode|undefined;
    to: ModuleNode;
    mapping: [string, string|any]; //Key is the from node output key, the value node to input key
    input_type: ModuleEdgeInput;
    constructor(edge_id: string, from: ModuleNode|undefined, to: ModuleNode, mapping: [string, any], input_type: ModuleEdgeInput) {
        this.edge_id = edge_id;
        this.from = from;
        this.to = to;
        this.mapping = mapping;
        this.input_type = input_type;
        if(!this.validate_inputs()) {
            throw new Error("Invalid module edge");
        }
    }

    validate_inputs(): boolean {
        if(this.mapping[0] === undefined || this.mapping[1] === undefined) {
            return false;
        }
        if(this.input_type === "signal_pass") {
            if(this.from === undefined) {
                return false;
            }
            if(!this.from.get_output_keys().includes(this.mapping[0])) {
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                return false;
            }
            return true;
        }
        if(this.input_type === "static_input") {
            if(this.from !== undefined) {
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                return false;
            }
            return true;
        }
        if(this.input_type === "user_input") {
            if(this.from !== undefined) {
                return false;
            }
            if(!this.to.get_input_keys().includes(this.mapping[1])) {
                return false;
            }
            return true;
        }
        return false;
    }


}

export abstract class UnsealConditionModule {
    protected name: string = "";
    protected description: string = "";
    protected inputs: IOMap = {};
    protected outputs: IOMap = {};
    protected proofLibrary: ProofLibraryType;
    protected nodes: {[key: string]: ModuleNode} = {};
    protected edges: {[key: string]: ModuleEdge} = {};
    constructor(name: string, description: string, proofLibrary: ProofLibraryType) {
        this.name = name;
        this.description = description;
        
        this.proofLibrary = proofLibrary;
    }
    getUserInputs(): IOMap {
        var user_inputs: IOMap = {};
        Object.keys(this.inputs).forEach((key: string) => {
            if (this.inputs[key].user_input) {
                user_inputs[key] = this.inputs[key];
            }
        });
        return user_inputs;
    }
    getOutputs(): IOMap {
        return this.outputs;
    }
    sortedNodes(): string[] {
        // Perform a topological sort of nodes based on edges

        // Collect all node ids
        const nodeIds = Object.keys(this.nodes);

        // Build a map of inbound edge counts for Kahn's algorithm
        const inDegree: { [id: string]: number } = {};
        for (const nodeId of nodeIds) {
            inDegree[nodeId] = 0;
        }
        for (const edge of Object.values(this.edges)) {
            if (edge.to && edge.to.node_id !== undefined) {
                inDegree[edge.to.node_id]++;
            }
        }

        // Initialize queue with nodes that have zero in-degree (no dependencies)
        const queue: string[] = [];
        for (const nodeId of nodeIds) {
            if (inDegree[nodeId] === 0) {
                queue.push(nodeId);
            }
        }

        const sorted: string[] = [];
        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            sorted.push(nodeId);

            // Decrement in-degree of nodes connected by an outgoing edge
            for (const edge of Object.values(this.edges)) {
                if (edge.from && edge.from.node_id === nodeId && edge.to && edge.to.node_id !== undefined) {
                    inDegree[edge.to.node_id]--;
                    if (inDegree[edge.to.node_id] === 0) {
                        queue.push(edge.to.node_id);
                    }
                }
            }
        }

        // If there are nodes left with non-zero in-degree, there's a cycle or disconnected nodes
        if (sorted.length !== nodeIds.length) {
            throw new Error("Cycle detected or orphan nodes in graph");
        }

        return sorted;
    }
    validateInputs(inputs: IOMap): boolean {
        var nodes = this.sortedNodes();
        var edges = Object.keys(this.edges);
        return true;
    }

    getInputEdgesForNode(node_id: string): ModuleEdge[] {
        return Object.values(this.edges).filter(edge => edge.to.node_id === node_id);
    }


    compile(address_map: {[key: string]: string}, input_mapping: {[key: string]: {        
        output_proof_indexes: number[];
        output_signal_indexes: number[];
    }}, current_proof_depth: number): CompiledModule {
        for(var input of Object.keys(this.inputs)) {
            if(input_mapping[input] === undefined) {
                throw new Error("Failed to compile module " + this.name + ": Input mapping not found for input " + input);
            }
        }
        var nodes = this.sortedNodes();
        var return_actions: UnsealProofAction[] = [];
        for(var node of nodes) {
            var compiled_node = this.nodes[node].proof.compile(address_map);
            if(compiled_node.prepare_action !== undefined) {
                return_actions.push(compiled_node.prepare_action);
            }


            var input_edges = this.getInputEdgesForNode(node);
            for(var input_edge of input_edges) {
                var module_input_key = input_edge.mapping[0];
                if(this.inputs[module_input_key] === undefined) {
                    throw new Error("Failed to compile module " + this.name + ": Input key not found for input " + module_input_key);
                }
                var public_input_index = this.nodes[node].proof.getProofInputSignalIndex(module_input_key);
                if(input_edge.input_type === ModuleEdgeInput.user_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT_FROM_USER,
                        params: {                            
                            public_input_index: public_input_index,
                        }
                    });
                }
                if(input_edge.input_type === ModuleEdgeInput.static_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT,
                        params: {
                            public_input_index: public_input_index,
                            value: input_mapping[module_input_key].value,
                        }
                    });
                }
            }



            if(compiled_node.validate_action !== undefined) {
                return_actions.push(compiled_node.validate_action);
            }
            
        }



        return {
            actions: [],
        }
    }
    
    
    
    
    
}