import { CollectionNode, CollectionEdge, ChangedType, ChangedCallback, CollectionEdgeInput, import_collectionnode_from_json, import_collectionedge_from_json, CompiledCollectionExport, RequiredUserInput, CollectionDataStream, DataStreamInput } from "./types";
import { ProofLibraryType } from "../proofs";
import { CompiledModule, ModuleLibraryType, UnsealConditionModule } from "../modules";
import { ACTION_STATIC_INPUT_FROM_USER, ProvingState } from "../ChainedProof";
import { UnsealConditionTemplate } from "./UnsealConditionTemplate";

import { sha256 } from "@noble/hashes/sha2";
import { cryptoTools } from "@nihilium/zkp-circuits";

export class UnsealConditionCollection {
    public nodes: {[key: string]: CollectionNode} = {};
    public edges: {[key: string]: CollectionEdge} = {};
    public data_streams: CollectionDataStream[] = [];
    public name: string;
    public description: string;
    public starting_node: CollectionNode|undefined = undefined;
    public proofLibrary: ProofLibraryType;
    public moduleLibrary: ModuleLibraryType;
    public changed_callback: ChangedCallback;
    constructor(name: string, description: string, 
        proofLibrary: ProofLibraryType, moduleLibrary: ModuleLibraryType,
        changed_callback: ChangedCallback = () => {}
    ) {
        this.name = name;
        this.description = description;
        this.proofLibrary = proofLibrary;
        this.moduleLibrary = moduleLibrary;
        this.changed_callback = changed_callback;
    }

    add_data_stream(datastream_id: string, from_node_id: string, field_name: string): void {
        if(this.nodes[from_node_id] === undefined) {
            throw new Error("From node not found");
        }
        var from = this.nodes[from_node_id];
        var data_stream = new CollectionDataStream(datastream_id, from, field_name);
        this.data_streams.push(data_stream);
        this.changed_callback({
            action: ChangedType.added,
            data_streams: [data_stream],
        });
    }
    remove_data_stream(datastream_id: string): void {
        this.data_streams = this.data_streams.filter(data_stream => data_stream.datastream_id !== datastream_id);
    }

    get_data_stream(datastream_id: string): CollectionDataStream | undefined {
        return this.data_streams.find(data_stream => data_stream.datastream_id === datastream_id);
    }

    add_node(module: UnsealConditionModule): string {
        var node = new CollectionNode(module.name + "_" + Object.keys(this.nodes).length, module, []);
        this.nodes[node.node_id] = node;
        var starting_node_changed = false;
        if(this.starting_node === undefined) {
            this.starting_node = node;
            starting_node_changed = true;
        }
        if(starting_node_changed) {
            this.changed_callback({
                action: ChangedType.added,
                nodes: [node],
                starting_node: this.starting_node,
            });
        }else{
            this.changed_callback({
                action: ChangedType.added,
                nodes: [node],
            });
        }
        return node.node_id;
    }

    remove_node(node_id: string): void {
        var node = this.nodes[node_id];
        if(node === undefined) {
            throw new Error("Node not found");
        }
        //Remove all edges connected to the node
        var edges_to_remove: CollectionEdge[] = []; 
        for(var edge of Object.values(this.edges)) {
            if(edge.from?.node_id === node.node_id || edge.to.node_id === node.node_id) {
                edges_to_remove.push(edge);
            }
        }
        for(var edge of edges_to_remove) {
            delete this.edges[edge.edge_id];
        }
        delete this.nodes[node.node_id];
        this.changed_callback({
            action: ChangedType.removed,
            nodes: [node],
            edges: edges_to_remove,
        });
    }
    remove_edge(edge_id: string): void {
        var edge = this.edges[edge_id];
        if(edge === undefined) {
            throw new Error("Edge not found");
        }
        delete this.edges[edge.edge_id];
        this.changed_callback({
            action: ChangedType.removed,
            edges: [edge],
        });
    }
    add_edge(source_node_id: string | undefined, target_node_id: string | undefined, mapping: [string, any],
         input_type: CollectionEdgeInput): void {
        if(target_node_id === undefined) {
            throw new Error("Source or target node not found");
        }
        var source_node = source_node_id ? this.nodes[source_node_id] : undefined;
        var target_node = this.nodes[target_node_id];
        if(target_node === undefined) {
            throw new Error("Target node not found");
        }
        var edge = new CollectionEdge(source_node, target_node, mapping, input_type);
        this.edges[edge.edge_id] = edge;
        this.changed_callback({
            action: ChangedType.added,
            edges: [edge],   
        });
    }

    export_to_json(): string {
        return JSON.stringify({
            name: this.name,
            description: this.description,
            starting_node: this.starting_node?.node_id,
            nodes: Object.values(this.nodes).map(node => node.export_to_json()),
            edges: Object.values(this.edges).map(edge => edge.export_to_json()),
        }, null, 2);
    }

    import_from_json(json: string): void {
        var data = JSON.parse(json);
        this.name = data.name;
        this.description = data.description;
        
        for(var node of data.nodes) {
            this.nodes[node.node_id] = import_collectionnode_from_json(JSON.stringify(node), this.moduleLibrary, this.proofLibrary);
        }
        for(var edge of data.edges) {
            this.edges[edge.edge_id] = import_collectionedge_from_json(JSON.stringify(edge), this.nodes);
        }
        this.starting_node = this.nodes[data.starting_node];
    }

    sort_nodes(): string[] | undefined {
        // Perform a depth-first topological sort starting from starting_node
        // Only signal_pass and link edges define ordering dependencies

        if (!this.starting_node) {
            return undefined;
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
            if ((edge.input_type === CollectionEdgeInput.signal_pass || edge.input_type === CollectionEdgeInput.link) &&
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
        const dfs = (nodeId: string): boolean => {
            if (inPath.has(nodeId)) {
                return false; // Cycle detected
            }
            if (visited.has(nodeId)) {
                return true; // Already processed
            }

            inPath.add(nodeId);
            visited.add(nodeId);
            sorted.push(nodeId); // Add node before visiting dependencies (pre-order)
            
            // Visit all neighbors (dependencies come after this node)
            for (const neighborId of adjacencyList[nodeId]) {
                if (!this.nodes[neighborId]) {
                    return false; // Edge references non-existent node
                }
                if (!dfs(neighborId)) {
                    return false; // Propagate failure
                }
            }

            inPath.delete(nodeId);
            return true;
        };

        // Start DFS from starting_node
        if (!this.nodes[this.starting_node.node_id]) {
            return undefined; // Starting node not found in nodes
        }
        if (!dfs(this.starting_node.node_id)) {
            return undefined; // Cycle or invalid edge detected
        }

        // Verify all nodes are reachable from starting_node
        if (sorted.length !== nodeIds.length) {
            return undefined; // Orphan nodes detected
        }

        return sorted;
    }


    getEdgesToNode(node_id: string): CollectionEdge[] {
        var edges: CollectionEdge[] = [];
        for(var edge of Object.values(this.edges)) {
            if(edge.to.node_id === node_id) {
                edges.push(edge);
            }
        }
        return edges;
    }

    getCollectionId(): string {
        return cryptoTools.uint8ArrayToHex(sha256(Buffer.from(this.export_to_json())));
    }
    //TODO handle branching
    createTemplate(address_map: {[key: string]: string}): UnsealConditionTemplate {

        var sorted_nodes = this.sort_nodes();
        if(sorted_nodes === undefined) {
            throw new Error("Collection not valid for compilation");
        }
        var compiled_modules: CompiledModule[] = [];
        var user_inputs: RequiredUserInput[] = [];
        
        var data_stream_inputs: DataStreamInput[] = [];
        var module_index = 0;
        for(var node_id of sorted_nodes) {
            var input_mapping: {[key: string]: {        
                output_proof_index: number;
                output_signal_indexes: number[];
            }} = {};
            var node = this.nodes[node_id];
            var edges_to_node = this.getEdgesToNode(node_id);
            for(var input_key of Object.keys(node.module.getUserInputs())) {
                var input = node.module.getUserInputs()[input_key];
                if(input.user_input){
                    //We don't need to do anything here
                    //Will be handled by the module compile function
                   
                }else {
                    var found_edge: CollectionEdge | undefined = undefined;
                    for(var edge of edges_to_node) {
                        if(edge.mapping[1] === input_key) {
                            found_edge = edge;
                            break;
                        }
                    }
                    if(!found_edge) {
                        throw new Error("Failed to compile module " + node.module.name + ": Input key not found for input " + input_key);
                    }
                    var compiled_from_node = compiled_modules.find(module => module.module_id === found_edge?.from?.node_id);
                    if(compiled_from_node === undefined) {
                        throw new Error("Failed to compile module " + node.module.name + ": From node not found for input " + input_key);
                    }
                    if(compiled_from_node.outputs[found_edge?.mapping[0]] === undefined) {
                        throw new Error("Failed to compile module " + node.module.name + ": Output not found for input " + input_key);
                    }
                    input_mapping[input_key] = {
                        output_proof_index: compiled_from_node.outputs[found_edge?.mapping[0]].output_proof_index,
                        output_signal_indexes: compiled_from_node.outputs[found_edge?.mapping[0]].output_signal_index,
                    };


                }
            }
            var depth = compiled_modules.length == 0 ? 0 : compiled_modules[compiled_modules.length - 1].new_depth;
            
            var compiled_module = node.module.compile(node.node_id,address_map, input_mapping, depth);
            compiled_modules.push(compiled_module);
            for(var action of compiled_module.actions) {
                if(action.action === ACTION_STATIC_INPUT_FROM_USER && 
                    node.module.getUserInputs()[action.params.module_input_key] !== undefined
                ) {
                    var input = node.module.getUserInputs()[action.params.module_input_key];
                    user_inputs.push({
                        proof_index: action.params.output_proof_index,
                        signal_indexes: action.params.public_input_index,
                        name: action.params.module_input_key,
                        description: input.description || "",
                    });
                }
            }

            //TODO Validate
            for(var data_stream of this.data_streams) {
                if(data_stream.from.node_id === node_id) {
                    var compiled_from_node = compiled_modules.find(module => module.module_id === data_stream.from?.node_id);
                    var output_signal_index = compiled_from_node?.outputs[data_stream.field_name]?.output_signal_index[0] || 0;
                    var output_proof_index = compiled_from_node?.outputs[data_stream.field_name]?.output_proof_index || 0;
                    data_stream_inputs.push({
                        datastream_id: data_stream.datastream_id,
                        output_proof_index: output_proof_index,
                        output_signal_index: output_signal_index,
                    });
                }
              
            }
            module_index += 1;
        }

       
        
        
       var toReturn = new UnsealConditionTemplate(this.name, this.description, this.proofLibrary, this.moduleLibrary, {
        compiled_modules: [compiled_modules],
        user_inputs: [user_inputs],
        data_stream_inputs: [data_stream_inputs],
        collection_id: this.getCollectionId(),
        collection_export: this.export_to_json(),
       });

        return toReturn;

    }


    
}
