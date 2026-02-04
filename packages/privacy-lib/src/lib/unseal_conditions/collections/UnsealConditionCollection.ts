import { CollectionNode, CollectionEdge, ChangedType, ChangedCallback, CollectionEdgeInput, import_collectionnode_from_json, import_collectionedge_from_json, CompiledCollectionExport, RequiredUserInput, CollectionDataStream, DataStreamInput } from "./types";
import { ProofLibraryType } from "../proofs";
import { CompiledModule, ModuleLibraryType, UnsealConditionModule } from "../modules";
import { ACTION_STATIC_INPUT_FROM_USER, ProvingState } from "../ChainedProof";
import { UnsealConditionTemplate } from "./UnsealConditionTemplate";

import { sha256 } from "@noble/hashes/sha2";
import { cryptoTools } from "@nihilium/zkp-circuits";

//A fork is always a module proof that returns false


export class UnsealConditionCollection {
    public nodes: {[key: string]: CollectionNode} = {};
    public edges: {[key: string]: CollectionEdge} = {};
    public data_streams: CollectionDataStream[] = [];
    public name: string;
    public description: string;
    public starting_node: CollectionNode|undefined = undefined;
    public proofLibrary: ProofLibraryType;
    public moduleLibrary: ModuleLibraryType;
    public forks: {[key: string]: string[]} = {};//NodeID -> ForkedNodeIDs
    public fork_list: string[] = [];
    private node_to_fork_map: {[key: string]: string} = {};
    private index_counter = 0;
    //ModuleID -> ForkIndex
    
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
    
    visual_forks(): string[] {
        var toReturn: string[] = [];
        for(var fork_id of this.fork_list) {
            var {nodes: sorted_nodes, forking: forking} = this.all_nodes_for_fork(fork_id);
            toReturn.push(sorted_nodes.join(" -> "));
        }
        return toReturn;
    }

    visual_edges_all(): string[][] {
        var toReturn: string[][] = [];
        for(var fork_id of this.fork_list) {
            toReturn.push(this.visual_edges(fork_id));
        }
        return toReturn;
    }
    visual_edges(fork_id: string): string[] {
        var toReturn: string[] = [];
        var {nodes: sorted_nodes, forking: forking} = this.all_nodes_for_fork(fork_id);
        for(var node_id of sorted_nodes) {
            var edges = this.getEdgesToNode(node_id);
            for(var edge of edges) {
                toReturn.push(edge.toString());
            }
        }
        return toReturn;
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

    /*
    From root this function will sort
CONNECTIONS:
  ━━━  = TRUE path (horizontal continuation)
  ╲    = FORK (45° diagonal to fork's first module)

LAYOUT EXAMPLE:

Depth:      0         1          2          3

Row 0:     [A]━━━━━[B*]━━━━━━[C]━━━━━━[D*]          Root (forks["root"])
                     ╲                  ╲
Row 1:                ╲                [G]           Fork from D* (last fork)
                       ╲
Row 2:                [E*]━━━━━━━━━━[F]              Fork from B*
                        ╲
Row 3:                 [H]                           Fork from E* (nested)

The forklist (draw order) should be:
"root, "d", "b", "e"
Sorting algorithm should be:
1. Start with root
2. Loop over all modules in the fork in reverse order. If a fork is found with that module name,
do the same for that fork recursively.
    */
    sort_fork_list(): void {
        const sorted_fork_list: string[] = [];
        
        // Helper function to recursively process a fork
        const process_fork = (fork_id: string): void => {
            // Add the current fork to the sorted list
            sorted_fork_list.push(fork_id);
            
            // Get all nodes in this fork
            const nodes_in_fork = this.forks[fork_id];
            if (!nodes_in_fork) return;
            
            // Loop through nodes in reverse order to find nested forks
            for (let i = nodes_in_fork.length - 1; i >= 0; i--) {
                const node_id = nodes_in_fork[i];
                
                // Check if this node has its own fork
                if (this.forks[node_id] !== undefined) {
                    // Recursively process the nested fork
                    process_fork(node_id);
                }
            }
        };
        
        // Start with "root" fork
        process_fork("root");
        
        // Update the fork_list with the sorted order
        this.fork_list = sorted_fork_list;
    }
    add_node(module: UnsealConditionModule, fork_from_node_id: string = "root"): string {
        var node = new CollectionNode(module.name + "_" + this.index_counter, module, []);
        console.log("Adding node: " + node.node_id + " from fork: " + fork_from_node_id);
        this.nodes[node.node_id] = node;
        var starting_node_changed = false;
        if(this.forks[fork_from_node_id] === undefined) {
            this.forks[fork_from_node_id] = [];
            this.fork_list.push(fork_from_node_id);
            this.sort_fork_list();
        }
        this.node_to_fork_map[node.node_id] = fork_from_node_id;
        this.forks[fork_from_node_id].push(node.node_id);
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
        this.index_counter += 1;
        return node.node_id;
    }
    
    move_node(node_id: string, 
        new_fork_from_node_id: string,
        at_position: number = -1): CollectionEdge[] {
        var node = this.nodes[node_id];
        if(node === undefined) {
            throw new Error("Node not found");
        }
        
        if(at_position < -1) {
            throw new Error("At position is out of bounds");
        }
        var real_at_position = at_position == -1 ? this.forks[new_fork_from_node_id].length - 1 : at_position;
        if(real_at_position >= 0 && real_at_position > this.forks[new_fork_from_node_id].length) {
            throw new Error("At position is out of bounds");
        }
        //Remove all edges that would be disconnected by the move        
        var to_edges = this.getEdgesToNode(node.node_id);
        var removed_edges: CollectionEdge[] = [];        
        for(var edge of to_edges) {
            removed_edges.push(edge);
            this.remove_edge(edge.edge_id);            
        }
        var from_edges = this.getEdgesFromNode(node.node_id);
        for(var edge of from_edges) {
            removed_edges.push(edge);
            this.remove_edge(edge.edge_id);
        }
        var old_fork_id = this.node_to_fork_map[node.node_id];
        this.node_to_fork_map[node.node_id] = new_fork_from_node_id;
        var index_in_old_fork = this.forks[old_fork_id].indexOf(node.node_id);
        this.forks[old_fork_id].splice(index_in_old_fork, 1);
        if(this.forks[old_fork_id].length === 0) {
            delete this.forks[old_fork_id];
            this.fork_list = this.fork_list.filter(fork => fork !== old_fork_id);
        }
        
        this.forks[new_fork_from_node_id].splice(real_at_position, 0, node.node_id);
        this.changed_callback({
            action: ChangedType.moved,
            nodes: [node],
        });
        this.changed_callback({
            action: ChangedType.removed,
            edges: removed_edges,
        });
        return removed_edges;
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
        var fork_id = this.node_to_fork_map[node.node_id];
        var index_in_fork = this.forks[fork_id].indexOf(node.node_id);
        this.forks[fork_id].splice(index_in_fork, 1);
        if(this.forks[fork_id].length === 0) {
            delete this.forks[fork_id];
            this.fork_list = this.fork_list.filter(fork => fork !== fork_id);
        }
        delete this.node_to_fork_map[node.node_id];
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
/*
This function returns all the nodes in the fork in the correct order
It does this by starting from the fork_id and going up the fork tree
It then prepends the nodes to the list
It then returns the list
*/
    all_nodes_for_fork(fork_id: string): {nodes: string[], forking: string[]} {
        var current_fork_id = fork_id;
        var previous_fork_id = this.node_to_fork_map[fork_id];
       
        //We can add all here
        var nodes: string[] = this.forks[current_fork_id];
        
        var forking: string[] = [];
        while(previous_fork_id !== undefined) {
            forking.push(current_fork_id)
            var previous_nodes = this.forks[previous_fork_id];
            var index = previous_nodes.indexOf(current_fork_id);
            nodes = previous_nodes.slice(0, index + 1).concat(nodes)
            previous_fork_id = this.node_to_fork_map[previous_fork_id]
        }
        return {nodes: nodes, forking: forking.reverse()};
    }

    validate_edge(source_node_id: string | undefined, target_node_id: string | undefined, mapping: [string, any],
        input_type: CollectionEdgeInput): boolean {
            if(target_node_id === undefined) {
                console.error("Source or target node not found");
                return false;
            }
            var source_node = source_node_id ? this.nodes[source_node_id] : undefined;
            var target_node = this.nodes[target_node_id];
            if(target_node === undefined) {
                console.error("Target node not found");
                return false;
            }
            if (source_node_id !== undefined && target_node_id !== undefined) {
                var {nodes: all_nodes, forking: forking} = this.all_nodes_for_fork(this.node_to_fork_map[target_node_id])
                var indexSource = all_nodes.indexOf(source_node_id);
                var indexTarget = all_nodes.indexOf(target_node_id);
                if(indexSource === -1 || indexTarget === -1) {
                    console.error("Source or target node not found in fork");
                    return false;
                }
                if(indexSource >= indexTarget) {
                    console.error("Source node must be before target node in fork");
                    return false;
                }
            }
        return true;
    }

    add_edge(source_node_id: string | undefined, target_node_id: string | undefined, mapping: [string, any],
         input_type: CollectionEdgeInput): void {
        if(!this.validate_edge(source_node_id, target_node_id, mapping, input_type)) {
            console.error("Invalid edge");
            return;
        }
        //Just to satisfy the type checker
        //Should be handled by the validate_edge function
        if(target_node_id === undefined) {
            console.error("Target node not found");
            return;
        }
        var source_node = source_node_id ? this.nodes[source_node_id] : undefined;
        var target_node = this.nodes[target_node_id];
        var edge = new CollectionEdge(source_node, target_node, mapping, input_type);
        this.edges[edge.edge_id] = edge;
        this.changed_callback({
            action: ChangedType.added,
            edges: [edge],   
        });
    }

    export_to_json(): any {
        return {
            name: this.name,
            description: this.description,
            starting_node: this.starting_node?.node_id,
            nodes: Object.values(this.nodes).map(node => node.export_to_json()),
            edges: Object.values(this.edges).map(edge => edge.export_to_json()),
            data_streams: this.data_streams.map(data_stream => data_stream.export_to_json()),
            forks: this.forks,
            fork_list: this.fork_list,
            node_to_fork_map: this.node_to_fork_map,
            index_counter: this.index_counter,
        };
    }

    import_from_json(data: any): void {
        
        this.name = data.name;
        this.description = data.description;
        
        for(var node of data.nodes) {
            this.nodes[node.node_id] = import_collectionnode_from_json(node, this.moduleLibrary, this.proofLibrary);
        }
        for(var edge of data.edges) {
            this.edges[edge.edge_id] = import_collectionedge_from_json(edge, this.nodes);
        }
        for(var data_stream of data.data_streams) {
            var from_node = this.nodes[data_stream.from_node_id];
            if(from_node === undefined) {
                throw new Error("From node not found");
            }
            var t_ds = new CollectionDataStream(data_stream.datastream_id, from_node, data_stream.field_name);
            this.data_streams.push(t_ds);
        }
        this.forks = data.forks;
        this.fork_list = data.fork_list;
        this.node_to_fork_map = data.node_to_fork_map;
        this.starting_node = this.nodes[data.starting_node];
        this.index_counter = data.index_counter;
        this.changed_callback({
            action: ChangedType.added,
            starting_node: this.starting_node,
        });
        this.changed_callback({
            action: ChangedType.added,
            nodes: Object.values(this.nodes),   
        });
        this.changed_callback({
            action: ChangedType.added,
            edges: Object.values(this.edges),   
        });
        if(this.data_streams.length > 0) {
            this.changed_callback({
                action: ChangedType.added,
                data_streams: this.data_streams,   
            });
        }
    }

/*
    sort_nodes_old(): string[] | undefined {
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
*/

    getEdgesToNode(node_id: string): CollectionEdge[] {
        var edges: CollectionEdge[] = [];
        for(var edge of Object.values(this.edges)) {
            if(edge.to.node_id === node_id) {
                edges.push(edge);
            }
        }
        return edges;
    }

    getEdgesFromNode(node_id: string): CollectionEdge[] {
        var edges: CollectionEdge[] = [];
        for(var edge of Object.values(this.edges)) {
            if(edge.from?.node_id === node_id) {
                edges.push(edge);
            }
        }
        return edges;
    }
    getCollectionId(): string {
        return cryptoTools.uint8ArrayToHex(sha256(Buffer.from(JSON.stringify(this.export_to_json()))));
    }

    createTemplate(address_map: {[key: string]: string}): UnsealConditionTemplate {
        
        var compiled_modules: CompiledModule[][] = [];
        var user_inputs: RequiredUserInput[][] = [];
        var data_stream_inputs: DataStreamInput[][] = [];
       
         //  var a=     {compiled_modules: CompiledModule[], user_inputs: RequiredUserInput[], data_stream_inputs: DataStreamInput[]} {
        console.log("Fork list: " + this.fork_list);
         for(var fork_id of this.fork_list) {
            var {nodes: sorted_nodes, forking: forking} = this.all_nodes_for_fork(fork_id);
            var result= this.createTemplatePerFork(address_map, sorted_nodes, forking);
            compiled_modules.push(result.compiled_modules);
            user_inputs.push(result.user_inputs);
            data_stream_inputs.push(result.data_stream_inputs);
        }
      
        var toReturn = new UnsealConditionTemplate(this.name, this.description, this.proofLibrary, this.moduleLibrary, {
            compiled_modules: compiled_modules,
            user_inputs: user_inputs,
            data_stream_inputs: data_stream_inputs,
            collection_id: this.getCollectionId(),
            collection_export: this.export_to_json(),
           });
           return toReturn;
    }
    //TODO handle branching
    createTemplatePerFork(address_map: {[key: string]: string}, sorted_nodes: string[], forking:string[]): {
        compiled_modules: CompiledModule[], user_inputs: RequiredUserInput[], data_stream_inputs: DataStreamInput[]} {

        // var sorted_nodes = this.sort_nodes();
        // if(sorted_nodes === undefined) {
        //     throw new Error("Collection not valid for compilation");
        // }
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
            var isForking = forking.includes(node_id);
            if(isForking) {
                console.log("Forking node: " + node_id);
            }
            var compiled_module = node.module.compile(node.node_id,address_map, input_mapping, depth, isForking);
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
                        module_id: compiled_module.module_id,
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

       
        
        
    //    var toReturn = new UnsealConditionTemplate(this.name, this.description, this.proofLibrary, this.moduleLibrary, {
    //     compiled_modules: [compiled_modules],
    //     user_inputs: [user_inputs],
    //     data_stream_inputs: [data_stream_inputs],
    //     collection_id: this.getCollectionId(),
    //     collection_export: this.export_to_json(),
    //    });

        return {
            compiled_modules: compiled_modules,
            user_inputs: user_inputs,
            data_stream_inputs: data_stream_inputs,
        };

    }


    
}
