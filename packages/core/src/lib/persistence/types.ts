import MerkleTree from "fixed-merkle-tree";


// export interface SealStorage {
//     get_seal(id: string): Promise<SealStoragePackage[]>
    
// }



export type OnChainPublishingState = {
    processing_local_tree: number;
    local_trees_to_process: number[];
    
}


export interface IDataStreamPersistence { 
    storeLocalTree(global_tree_index: number, merkleTree:MerkleTree): Promise<void>;
    storeLocalTreeLeaf(global_tree_index: number, local_tree_index: number, leaf: string): Promise<void>;
    storeGlobalValueTreeLeaf(local_tree_root: string, timestamp: number): Promise<void>;
    storeGlobalRootTreeLeaf(root_value: string): Promise<void>;
    storeLocalTreeCache(global_tree_index: number, cache: string): Promise<void>;
    getIndexedLocalLeaf(leaf: string): Promise<[number, number][]>;
    getLocalTree(global_tree_index: number): Promise<MerkleTree>;
    getGlobalValueTree(): Promise<MerkleTree>;
    resetContractTrees(): Promise<void>;
    getGlobalLeafTimestamps(): Promise<Map<string, number>>;
    getGlobalRootTree(): Promise<MerkleTree>;
    getLocalTreeCache(global_tree_index: number): Promise<string>;
    detectLocalTreesAvailable(max_global_tree_index: number): Promise<boolean>;
    getOnChainPublishingState(): Promise<OnChainPublishingState>;
    setOnChainPublishingState(state: OnChainPublishingState): Promise<void>;
}
