import { ACTION_PASS_SIGNAL, ACTION_STATIC_INPUT, ACTION_STATIC_INPUT_FROM_USER } from "../ChainedProof";
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
export type ModuleOutput = {
    type_order: IOType[];
    name: string;
    description: string;
    proof_key: string;
    signal_key: string; //[Start index, length]
}
export type IOMap = {
    [key: string]: IO;
}

export type ModuleOutputMap = {
    [key: string]: ModuleOutput;
}

export type CompiledModule = {
    module_id: string;
    module_name: string; //Used for proving function lookup
    new_depth: number;
    actions: UnsealProofAction[];
    outputs: {
        [key: string]: {
            output_proof_index: number;
            output_signal_index: [number, number];
        }
    };
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

    get_outputs(): { [key: string]: [number, number] } {
        return this.proof.getPublicSignals();
    }

    get_output_keys(): string[] {
        return Object.keys(this.get_outputs());
    }
    // get_input_keys(): string[] {
    //     return this.proof.getProofInputSignalKeys();
    // }

    // validate_input_mapping(input_mapping: {[key: string]: any}): boolean {
    //     return this.proof.getProofInputSignalKeys().every(key => input_mapping[key] !== undefined);
    // }
}

export enum ModuleEdgeInput {
    external_input = "external_input",
    link = "link",//Simple link to define ordering
    signal_pass = "signal_pass",
    static_input = "static_input",
    user_input = "user_input"//becomes a static input during compilation
}

export class WrappedProof {
    proof: UnsealConditionProof;
    id: string;
    index: number;
    constructor(proof: UnsealConditionProof, id: string, index: number) {
        this.proof = proof;
        this.id = id;
        this.index = index;
    }

    get_outputs(): { [key: string]: [number, number] } {
        return this.proof.getPublicSignals();
    }

    get_output_keys(): string[] {
        return Object.keys(this.get_outputs());
    }


    // validate_input_mapping(input_mapping: {[key: string]: any}): boolean {
    //     return this.proof.getProofInputSignalKeys().every(key => input_mapping[key] !== undefined);
    // }
}


export class SignalEdge {
    edge_id: string;
    from: WrappedProof | undefined;
    to: WrappedProof;
    mapping: [string, string | any]; //Key is the from node output key, the value node to input key
    input_type: ModuleEdgeInput;
    constructor(from: WrappedProof | undefined, to: WrappedProof, mapping: [string, any], input_type: ModuleEdgeInput, edge_id: string = "") {
        this.edge_id = edge_id;

        this.from = from;
        this.to = to;
        this.mapping = mapping;
        if (edge_id == "") {
            this.edge_id = this.from?.id + "_" + this.to.id + "_" + this.mapping[0] + "_" + this.mapping[1];
        }
        this.input_type = input_type;
        if (this.from !== undefined && this.from.index >= this.to.index) {
            throw new Error("From index must be less than to index");
        }
        if (!this.validate_inputs()) {
            throw new Error("Invalid module edge");
        }
    }

    validate_inputs(): boolean {
        if (this.mapping[0] === undefined || this.mapping[1] === undefined) {
            return false;
        }
        if (this.input_type === "signal_pass") {
            if (this.from === undefined) {
                console.log("From is undefined");
                return false;
            }
            if (!this.from.get_output_keys().includes(this.mapping[0])) {
                console.log("From output key not found");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "static_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "user_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "external_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "link") {
            // Link edges require a from node to define ordering
            if (this.from === undefined) {
                console.log("From is undefined for link edge");
                return false;
            }
            if (this.to === undefined) {
                console.log("To is undefined for link edge");
                return false;
            }
            return true;
        }
        return false;
    }


}


export class ModuleEdge {
    edge_id: string;
    from: ModuleNode | undefined;
    to: ModuleNode;
    mapping: [string, string | any]; //Key is the from node output key, the value node to input key
    input_type: ModuleEdgeInput;
    constructor(from: ModuleNode | undefined, to: ModuleNode, mapping: [string, any], input_type: ModuleEdgeInput, edge_id: string = "") {
        this.edge_id = edge_id;

        this.from = from;
        this.to = to;
        this.mapping = mapping;
        if (edge_id == "") {
            this.edge_id = this.from?.node_id + "_" + this.to.node_id + "_" + this.mapping[0] + "_" + this.mapping[1];
        }
        this.input_type = input_type;
        if (!this.validate_inputs()) {
            throw new Error("Invalid module edge");
        }
    }

    validate_inputs(): boolean {
        if (this.mapping[0] === undefined || this.mapping[1] === undefined) {
            return false;
        }
        if (this.input_type === "signal_pass") {
            if (this.from === undefined) {
                console.log("From is undefined");
                return false;
            }
            if (!this.from.get_output_keys().includes(this.mapping[0])) {
                console.log("From output key not found");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "static_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "user_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "external_input") {
            if (this.from !== undefined) {
                console.log("From is not undefined");
                return false;
            }
            if (!this.to.get_output_keys().includes(this.mapping[1])) {
                console.log("To input key not found");
                return false;
            }
            return true;
        }
        if (this.input_type === "link") {
            // Link edges require a from node to define ordering
            if (this.from === undefined) {
                console.log("From is undefined for link edge");
                return false;
            }
            if (this.to === undefined) {
                console.log("To is undefined for link edge");
                return false;
            }
            return true;
        }
        return false;
    }


}

/**
 * 
 */
export enum ModuleEligibility {
    eligible = "eligible",
    not_eligible = "not_eligible",
    passive_waiting = "passive_waiting",
    active_waiting = "active_waiting",
}

export abstract class UnsealConditionModuleOld {
    public name: string = "";
    public short_description: string = "";
    public description: string = "";
    protected inputs: IOMap = {};
    protected outputs: ModuleOutputMap = {};
    protected proofLibrary: ProofLibraryType;
    protected startingNode: ModuleNode | undefined = undefined;
    protected nodes: { [key: string]: ModuleNode } = {};
    protected edges: { [key: string]: ModuleEdge } = {};
    constructor(name: string, short_description: string, proofLibrary: ProofLibraryType) {
        this.name = name;
        this.short_description = short_description;

        this.proofLibrary = proofLibrary;
    }
    getUserInputs(): IOMap {

        return this.inputs;
    }
    getOutputs(): ModuleOutputMap {
        return this.outputs;
    }

    sortedNodes(): string[] {
        // Perform a depth-first topological sort starting from startingNode
        // Only signal_pass and link edges define ordering dependencies

        if (!this.startingNode) {
            throw new Error("Starting node is not defined");
        }

        const nodeIds = Object.keys(this.nodes);
        if (nodeIds.length === 0) {
            return [];
        }

        // Build adjacency list for ordering edges (signal_pass and link only)
        const adjacencyList: { [id: string]: string[] } = {};
        for (const nodeId of nodeIds) {
            adjacencyList[nodeId] = [];
        }

        for (const edge of Object.values(this.edges)) {
            // Only signal_pass and link edges define ordering
            if ((edge.input_type === ModuleEdgeInput.signal_pass || edge.input_type === ModuleEdgeInput.link) &&
                edge.from && edge.to && edge.from.node_id && edge.to.node_id) {
                const fromId = edge.from.node_id;
                const toId = edge.to.node_id;
                if (!adjacencyList[fromId].includes(toId)) {
                    adjacencyList[fromId].push(toId);
                }
            }
        }

        // Track visited nodes and nodes in current path (for cycle detection)
        const visited: Set<string> = new Set();
        const inPath: Set<string> = new Set();
        const sorted: string[] = [];

        // DFS helper function (pre-order traversal for topological sort)
        // If A -> B, we want A before B, so we add A before visiting B
        const dfs = (nodeId: string): void => {
            if (inPath.has(nodeId)) {
                throw new Error(`Cycle detected in graph at node: ${nodeId}`);
            }
            if (visited.has(nodeId)) {
                return; // Already processed
            }

            inPath.add(nodeId);
            visited.add(nodeId);
            sorted.push(nodeId); // Add node before visiting dependencies (pre-order)

            // Visit all neighbors (dependencies come after this node)
            for (const neighborId of adjacencyList[nodeId]) {
                if (!this.nodes[neighborId]) {
                    throw new Error(`Edge references non-existent node: ${neighborId}`);
                }
                dfs(neighborId);
            }

            inPath.delete(nodeId);
        };

        // Start DFS from startingNode
        if (!this.nodes[this.startingNode.node_id]) {
            throw new Error(`Starting node ${this.startingNode.node_id} not found in nodes`);
        }
        dfs(this.startingNode.node_id);

        // Verify all nodes are reachable from startingNode
        if (sorted.length !== nodeIds.length) {
            const unreachable = nodeIds.filter(id => !visited.has(id));
            throw new Error(`Orphan nodes detected that are not reachable from startingNode: ${unreachable.join(", ")}`);
        }

        return sorted;
    }
    validateInputs(inputs: IOMap): boolean {
        var nodes = this.sortedNodes();
        var edges = Object.keys(this.edges);
        return true;
    }

    getPassedSignalForProof(input_key: string, previous_signals: any[][]): any {

    }

    getInputEdgesForNode(node_id: string): ModuleEdge[] {
        return Object.values(this.edges).filter(edge => edge.to.node_id === node_id);
    }


    /**
     * Produces the proofs for the module
     * @param args 
     */
    async produce_proofs(...args: any[]): Promise<{ proofs: any[], public_inputs: any[][] }> {
        throw new Error("Not implemented");
    }

    /**
     * Prepares the module for proving, this can be publishing a value onto the 
     * data stream or call external functions that might take longer to complete.
     
     * @param args 
     */
    async prepare_for_proving(...args: any[]): Promise<any> {
        throw new Error("Not implemented");
    }

    /**
     * Checks if the module is eligible to prove
     * @param args 
     */
    async eligible_to_prove(...args: any[]): Promise<boolean> {
        throw new Error("Not implemented");
    }

    async transform_user_inputs(input_mapping: { [key: string]: any }): Promise<{ [key: string]: any }> {

        return input_mapping;
    }

    compile(external_node_id: string, address_map: { [key: string]: string }, input_mapping: {
        [key: string]: {
            output_proof_index: number;
            output_signal_indexes: number[];
        }
    }, current_proof_depth: number): CompiledModule {
        //Check if all inputs are mapped
        for (var input of Object.keys(this.inputs)) {
            if (this.inputs[input].user_input === false) {
                if (input_mapping[input] === undefined) {
                    throw new Error("Failed to compile module " + this.name + ": Input mapping not found for input " + input);
                } else {

                    if (input_mapping[input].output_signal_indexes.length !== 2) {
                        throw new Error("Failed to compile module " + this.name + ": Input mapping for input " + input + " has " + input_mapping[input].output_signal_indexes.length + " output signal indexes, expected 1");
                    }
                }
            }
        }
        var nodes = this.sortedNodes();

        var return_actions: UnsealProofAction[] = [];
        //Used for user inputs to offset
        var new_node_index = 0;
        for (var node_id of nodes) {

            var node = this.nodes[node_id];
            var compiled_node = node.proof.compile(address_map);

            if (compiled_node.prepare_action !== undefined) {
                return_actions.push(compiled_node.prepare_action);
            }


            var input_edges = this.getInputEdgesForNode(node_id);
            for (var input_edge of input_edges) {
                var module_input_key = input_edge.mapping[0];
                if (input_edge.from?.get_output_keys().includes(module_input_key) === false && input_edge.input_type !== ModuleEdgeInput.link) {
                    throw new Error("Failed to compile module " + this.name + ": Input key not found for input " + module_input_key);
                }
                var public_input_index = node.proof.getPublicSignals()[module_input_key];
                if (input_edge.input_type === ModuleEdgeInput.user_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT_FROM_USER,
                        params: {
                            module_input_key: module_input_key,
                            output_proof_index: current_proof_depth + new_node_index,
                            public_input_index: public_input_index,
                        }
                    });
                }
                if (input_edge.input_type === ModuleEdgeInput.static_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT,
                        params: {
                            public_input_index: public_input_index,
                            value: input_edge.mapping[1],
                        }
                    });
                }
                //External signal passing, use the input_mapping
                if (input_edge.input_type === ModuleEdgeInput.external_input) {
                    return_actions.push({
                        action: ACTION_PASS_SIGNAL,
                        params: {
                            public_input_indexes: node.proof.getSignalIndex(input_edge.mapping[1]),
                            output_proof_index: input_mapping[input_edge.mapping[0]].output_proof_index,
                            output_signal_indexes: input_mapping[input_edge.mapping[0]].output_signal_indexes,
                        }
                    });
                }
                //Internal signal passing, use the depth
                if (input_edge.input_type === ModuleEdgeInput.signal_pass) {
                    return_actions.push({
                        action: ACTION_PASS_SIGNAL,
                        params: {
                            public_input_indexes: node.proof.getSignalIndex(input_edge.mapping[1]),
                            output_proof_index: current_proof_depth + (nodes.indexOf(input_edge.from?.node_id || "")), //Length 1 for default, TODO make this dynamic
                            output_signal_indexes: input_edge.from?.get_outputs()[input_edge.mapping[0]],
                        }
                    });
                }
                if (input_edge.input_type === ModuleEdgeInput.link) {
                    //Do nothing, just to define ordering
                }

            }
            new_node_index++;

            //Close it off
            if (compiled_node.validate_action !== undefined) {
                return_actions.push(compiled_node.validate_action);
            }


        }
        var output_map: {
            [key: string]: {
                output_proof_index: number;
                output_signal_index: [number, number];
            }
        } = {};
        for (var output_key of Object.keys(this.outputs)) {
            //don't care about links
            if (output_key !== "link") {
                output_map[output_key] = {
                    output_proof_index: current_proof_depth + nodes.indexOf(this.outputs[output_key].proof_key),
                    output_signal_index: this.nodes[this.outputs[output_key].proof_key].get_outputs()[this.outputs[output_key].signal_key],
                };
            }
        }


        //TODO implement
        return {
            module_id: external_node_id,
            module_name: this.name,
            new_depth: current_proof_depth + nodes.length,
            actions: return_actions,
            outputs: output_map,
        };
    }
}

export type ModuleProof = {
    proofs: any[];
    public_inputs: any[][];
    outputs: {
        [key: string]: string;
    }
}

export abstract class UnsealConditionModule {
    public name: string = "";
    public short_description: string = "";
    public description: string = "";
    protected inputs: IOMap = {};
    protected outputs: ModuleOutputMap = {};
    protected proofLibrary: ProofLibraryType;
    protected proofs: { [key: string]: WrappedProof } = {};
    protected proofList: string[] = []
    protected edges: { [key: string]: SignalEdge } = {};
    constructor(name: string, short_description: string, proofLibrary: ProofLibraryType) {
        this.name = name;
        this.short_description = short_description;

        this.proofLibrary = proofLibrary;
    }
    getUserInputs(): IOMap {

        return this.inputs;
    }
    getOutputs(): ModuleOutputMap {
        return this.outputs;
    }

    addProof(proof: UnsealConditionProof, easyId: boolean = true): string {
        var id = this.generateProofId(proof, easyId);
        this.proofs[id] = new WrappedProof(proof, id, this.proofList.length);
        this.proofList.push(id);
        return id;
    }

    addSignalEdge(from: string | undefined, to: string, mapping: [string, any], input_type: ModuleEdgeInput): void {
        this.edges[from + "_" + to + "_" + mapping[0] + "_" + mapping[1]] = 
          new SignalEdge(from ? this.proofs[from] : undefined, this.proofs[to], mapping, input_type);
    }

    private generateProofId(proof: UnsealConditionProof, easyId: boolean): string {

        var proofCounter = 0
        while (this.proofs[proof.data.name + (easyId ? "" : "_" + proof.data.version) + "_" + proofCounter.toString()] !== undefined) {
            proofCounter++;
        }
        //if (proofCounter > 0) {
        //    console.log("Proof id already exists, adding counter", proof.data.name + (easyId ? "" : "_" + proof.data.version) + "_" + proofCounter.toString());
         //   return proof.data.name + (easyId ? "" : "_" + proof.data.version) + "_" + proofCounter.toString();
        //}
        console.log("Proof id created", proof.data.name + (easyId ? "" : "_" + proof.data.version) + "_" + proofCounter.toString());
        return proof.data.name + (easyId ? "" : "_" + proof.data.version) + "_" + proofCounter.toString();

    }

    validateInputs(inputs: IOMap): boolean {
        //var nodes = this.sortedNodes();
        var edges = Object.keys(this.edges);
        return true;
    }

    getPassedSignalForProof(input_key: string, previous_signals: any[][]): any {

    }

    getInputEdgesForProof(proof_id: string): SignalEdge[] {
        return Object.values(this.edges).filter(edge => edge.to.id === proof_id);
    }


    /**
     * Produces the proofs for the module
     * @param args 
     */
    async produce_proofs(...args: any[]): Promise<ModuleProof> {
        throw new Error("Not implemented");
    }

    /**
     * Prepares the module for proving, this can be publishing a value onto the 
     * data stream or call external functions that might take longer to complete.
     
     * @param args 
     */
    async prepare_for_proving(...args: any[]): Promise<any> {
        throw new Error("Not implemented");
    }

    /**
     * Checks if the module is eligible to prove
     * @param args 
     */
    async eligible_to_prove(...args: any[]): Promise<boolean> {
        throw new Error("Not implemented");
    }

    async transform_user_inputs(input_mapping: { [key: string]: any }): Promise<{ [key: string]: any }> {

        return input_mapping;
    }

    compile(external_node_id: string, address_map: { [key: string]: string }, input_mapping: {
        [key: string]: {
            output_proof_index: number;
            output_signal_indexes: number[];
        }
    }, current_proof_depth: number): CompiledModule {
        //Check if all inputs are mapped
        for (var input of Object.keys(this.inputs)) {
            if (this.inputs[input].user_input === false) {
                if (input_mapping[input] === undefined) {
                    throw new Error("Failed to compile module " + this.name + ": Input mapping not found for input " + input);
                } else {

                    if (input_mapping[input].output_signal_indexes.length !== 2) {
                        throw new Error("Failed to compile module " + this.name + ": Input mapping for input " + input + " has " + input_mapping[input].output_signal_indexes.length + " output signal indexes, expected 1");
                    }
                }
            }
        }
        var nodes = this.proofList;

        var return_actions: UnsealProofAction[] = [];
        //Used for user inputs to offset
        var new_node_index = 0;
        for (var node_id of nodes) {

            var node = this.proofs[node_id];
            var compiled_node = node.proof.compile(address_map);

            if (compiled_node.prepare_action !== undefined) {
                return_actions.push(compiled_node.prepare_action);
            }


            var input_edges = this.getInputEdgesForProof(node_id);
            for (var input_edge of input_edges) {
                var module_input_key = input_edge.mapping[0];
                var module_to_input_key = input_edge.mapping[1];
                if (input_edge.from?.get_output_keys().includes(module_input_key) === false && input_edge.input_type !== ModuleEdgeInput.link) {
                    throw new Error("Failed to compile module " + this.name + ": Input key not found for input " + module_input_key);
                }
                var public_input_index = node.proof.getPublicSignals()[module_to_input_key];
                if(public_input_index === undefined) {
                    throw new Error("Failed to compile module " + this.name + ": Public input index not found for input " + module_input_key + " for proof " + node.proof.data.name);
                }
                if (input_edge.input_type === ModuleEdgeInput.user_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT_FROM_USER,
                        params: {
                            module_input_key: module_input_key,
                            output_proof_index: current_proof_depth + new_node_index,
                            public_input_index: public_input_index,
                        }
                    });
                }
                if (input_edge.input_type === ModuleEdgeInput.static_input) {
                    return_actions.push({
                        action: ACTION_STATIC_INPUT,
                        params: {
                            public_input_index: public_input_index,
                            value: input_edge.mapping[1],
                        }
                    });
                }
                //External signal passing, use the input_mapping
                if (input_edge.input_type === ModuleEdgeInput.external_input) {
                    return_actions.push({
                        action: ACTION_PASS_SIGNAL,
                        params: {
                            public_input_indexes: node.proof.getSignalIndex(input_edge.mapping[1]),
                            output_proof_index: input_mapping[input_edge.mapping[0]].output_proof_index,
                            output_signal_indexes: input_mapping[input_edge.mapping[0]].output_signal_indexes,
                        }
                    });
                }
                //Internal signal passing, use the depth
                if (input_edge.input_type === ModuleEdgeInput.signal_pass) {
                    return_actions.push({
                        action: ACTION_PASS_SIGNAL,
                        params: {
                            public_input_indexes: node.proof.getSignalIndex(input_edge.mapping[1]),
                            output_proof_index: current_proof_depth + (nodes.indexOf(input_edge.from?.id || "")), //Length 1 for default, TODO make this dynamic
                            output_signal_indexes: input_edge.from?.get_outputs()[input_edge.mapping[0]],
                        }
                    });
                }
                if (input_edge.input_type === ModuleEdgeInput.link) {
                    //Do nothing, just to define ordering
                }

            }
            new_node_index++;

            //Close it off
            if (compiled_node.validate_action !== undefined) {
                return_actions.push(compiled_node.validate_action);
            }


        }
        var output_map: {
            [key: string]: {
                output_proof_index: number;
                output_signal_index: [number, number];
            }
        } = {};
        for (var output_key of Object.keys(this.outputs)) {
            //don't care about links
            if (output_key !== "link") {
                output_map[output_key] = {
                    output_proof_index: current_proof_depth + nodes.indexOf(this.outputs[output_key].proof_key),
                    output_signal_index: this.proofs[this.outputs[output_key].proof_key].get_outputs()[this.outputs[output_key].signal_key],
                };
            }
        }


        //TODO implement
        return {
            module_id: external_node_id,
            module_name: this.name,
            new_depth: current_proof_depth + nodes.length,
            actions: return_actions,
            outputs: output_map,
        };
    }
}





