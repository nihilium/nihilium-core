import MerkleTree from "fixed-merkle-tree";


// export interface SealStorage {
//     get_seal(id: string): Promise<SealStoragePackage[]>
    
// }



export type OnChainPublishingState = {
    processing_local_tree: number;
    local_trees_to_process: number[];

}

/**
 * One anchored publication round, in round order: entry i describes global tree leaf i. Keeps the
 * round -> timestamp lookup positional instead of keyed by the subtree root, which two rounds can
 * share if they happen to contain the same leaves.
 */
export type GlobalLeafEntry = {
    root: string;
    timestamp: number;
    blockHash: string;
}


export interface IDataStreamPersistence { 
    storeLocalTree(global_tree_index: number, merkleTree:MerkleTree): Promise<void>;
    storeLocalTreeLeaf(global_tree_index: number, local_tree_index: number, leaf: string): Promise<void>;
    storeGlobalValueTreeLeaf(local_tree_root: string, timestamp: number, blockHash: string): Promise<void>;
    storeGlobalRootTreeLeaf(root_value: string): Promise<void>;
    storeLocalTreeCache(global_tree_index: number, cache: string): Promise<void>;
    getIndexedLocalLeaf(leaf: string): Promise<[number, number][]>;
    getLocalTree(global_tree_index: number): Promise<MerkleTree>;
    getGlobalValueTree(): Promise<MerkleTree>;
    resetContractTrees(): Promise<void>;
    getGlobalLeafTimestamps(): Promise<Map<string, number>>;
    getGlobalLeafBlockHashes(): Promise<Map<string, string>>;
    getGlobalLeafEntries(): Promise<GlobalLeafEntry[]>;
    storeGlobalDualTreeLeaf(value_tree_root: string): Promise<void>;
    getGlobalDualTree(): Promise<MerkleTree>;
    resetDualTree(): Promise<void>;
    getGlobalRootTree(): Promise<MerkleTree>;
    getLocalTreeCache(global_tree_index: number): Promise<string>;
    detectLocalTreesAvailable(max_global_tree_index: number): Promise<boolean>;
    getOnChainPublishingState(): Promise<OnChainPublishingState>;
    setOnChainPublishingState(state: OnChainPublishingState): Promise<void>;
}
