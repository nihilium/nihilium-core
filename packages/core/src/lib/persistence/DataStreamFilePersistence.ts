
import { promises as fs } from 'fs';
import path from 'path';
import MerkleTree from 'fixed-merkle-tree';
import { GlobalLeafEntry, IDataStreamPersistence, OnChainPublishingState } from './types';
import { createMimcMerkelTree, treeHasher, keccakTreeHasher } from '../utils';
import { Level } from 'level';
const defaultDepth = 24;
export class DataStreamFilePersistence implements IDataStreamPersistence {
    private folderPath: string;
    private createMerkelTree: (depth: number, leaves: string[]) => Promise<MerkleTree>;
    private readonly LOCAL_TREE_PREFIX = 'local_tree_';
    private readonly GLOBAL_VALUE_FILE = 'global_value.txt';
    private readonly GLOBAL_ROOT_FILE = 'global_root.txt';
    private readonly GLOBAL_DUAL_FILE = 'global_dual.txt';
    private readonly ON_CHAIN_PUBLISHING_STATE_FILE = 'onchain_publishing_state.json';
    private readonly LV_INDEX_DB = 'lv_index.level';
    private lv_index_db: Level<string, number[]>;
    constructor(folderPath: string, createMerkelTree: (depth: number, leaves: string[]) => Promise<MerkleTree> = createMimcMerkelTree) {
        this.folderPath = folderPath;
        this.lv_index_db = new Level(path.join(this.folderPath, this.LV_INDEX_DB));
        this.ensureFolderExists();
        this.createMerkelTree = createMerkelTree;
    }

    private async ensureFolderExists(): Promise<void> {
        await fs.mkdir(this.folderPath, { recursive: true });
    }

    async getIndexedLocalLeaf(leaf: string): Promise<[number, number][]> {
        
        var value = (await this.lv_index_db.get(leaf)) as unknown as string;
        if(!value) {
            return [];
        }
        const nums = value.split(',').map(Number);
        const pairs: [number, number][] = [];
        for (let i = 0; i < nums.length; i += 2) {
            if (i + 1 < nums.length) {
                pairs.push([nums[i], nums[i + 1]]);
            }
        }
        return pairs;
        
        


    }

    async resetContractTrees(): Promise<void> {
        const filePath1 = this.getGlobalValuePath();
        await fs.writeFile(filePath1, '');
        const filePath2 = this.getGlobalRootPath();
        await fs.writeFile(filePath2, '');
    }

    private getLocalTreePath(globalTreeIndex: number): string {
        return path.join(this.folderPath, `${this.LOCAL_TREE_PREFIX}${globalTreeIndex}.txt`);
    }

    private getGlobalValuePath(): string {
        return path.join(this.folderPath, this.GLOBAL_VALUE_FILE);
    }

    private getGlobalRootPath(): string {
        return path.join(this.folderPath, this.GLOBAL_ROOT_FILE);
    }

    async storeLocalTreeLeaf(globalTreeIndex: number, localTreeIndex: number, leaf: string): Promise<void> {
        
        const filePath = this.getLocalTreePath(globalTreeIndex);
        var already_stored = await this.getIndexedLocalLeaf(leaf);
        already_stored.push([globalTreeIndex, localTreeIndex]);
        await this.lv_index_db.put(leaf, already_stored.flat());
        await fs.appendFile(filePath, leaf + '\n');
    }

    async storeGlobalValueTreeLeaf(localTreeRoot: string, timestamp: number, blockHash: string): Promise<void> {
        if(localTreeRoot == "0x00000000000000000000000000000006b6819950000000000000000000000000") {
            console.log("Skipping global value tree leaf", localTreeRoot, timestamp)
        }
        const filePath = this.getGlobalValuePath();
        await fs.appendFile(filePath, `${localTreeRoot},${timestamp},${blockHash}\n`);
    }

    async getGlobalLeafTimestamps(): Promise<Map<string, number>> {
        const timestamps = new Map<string, number>();
        try {
            const filePath = this.getGlobalValuePath();
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line) {
                    const [root, timestamp] = line.split(',');
                    timestamps.set(root, Number(timestamp));
                }
            }
        } catch {
            return timestamps;
        }
        return timestamps;
    }

    async getGlobalLeafBlockHashes(): Promise<Map<string, string>> {
        const blockHashes = new Map<string, string>();
        try {
            const filePath = this.getGlobalValuePath();
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line) {
                    const [root, , blockHash] = line.split(',');
                    blockHashes.set(root, blockHash);
                }
            }
        } catch {
            return blockHashes;
        }
        return blockHashes;
    }

    /**
     * The same global_value.txt, read positionally: line i is round i. Used to answer "which round is
     * this occurrence in, and when was it anchored" without going through the root-keyed maps.
     */
    async getGlobalLeafEntries(): Promise<GlobalLeafEntry[]> {
        const entries: GlobalLeafEntry[] = [];
        try {
            const filePath = this.getGlobalValuePath();
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line) {
                    const [root, timestamp, blockHash] = line.split(',');
                    entries.push({ root, timestamp: Number(timestamp), blockHash });
                }
            }
        } catch {
            return entries;
        }
        return entries;
    }

    async storeGlobalDualTreeLeaf(valueTreeRoot: string): Promise<void> {
        const filePath = path.join(this.folderPath, this.GLOBAL_DUAL_FILE);
        await fs.appendFile(filePath, `${valueTreeRoot}\n`);
    }

    async getGlobalDualTree(): Promise<MerkleTree> {
        const filePath = path.join(this.folderPath, this.GLOBAL_DUAL_FILE);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const leaves = content.split('\n').filter(line => line.trim());
            return await this.createMerkelTree(defaultDepth, leaves);
        } catch {
            return await this.createMerkelTree(defaultDepth, []);
        }
    }

    async resetDualTree(): Promise<void> {
        const filePath = path.join(this.folderPath, this.GLOBAL_DUAL_FILE);
        await fs.writeFile(filePath, '');
    }

    async storeGlobalRootTreeLeaf(rootValue: string): Promise<void> {
        
        const filePath = this.getGlobalRootPath();
        await fs.appendFile(filePath, rootValue + '\n');
    }

    async storeLocalTreeCache(globalTreeIndex: number, cache: string): Promise<void> {
        
        const filePath = this.getLocalTreePath(globalTreeIndex) + '.cache';
        await fs.writeFile(filePath, cache);
    }

    async getLocalTreeCache(globalTreeIndex: number): Promise<string> {
        const filePath = this.getLocalTreePath(globalTreeIndex) + '.cache';
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            return '';
        }
    }

    async getLocalTree(globalTreeIndex: number): Promise<MerkleTree> {
        const filePath = this.getLocalTreePath(globalTreeIndex);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const leaves = content.split('\n').filter(line => line.trim());
            const depth = defaultDepth//Math.ceil(Math.log2(leaves.length + 1));
            return await this.createMerkelTree(depth, leaves);
        } catch (e) {
            console.log(e)
            return await this.createMerkelTree(defaultDepth, []);
        }
    }

    async getGlobalValueTree(): Promise<MerkleTree> {
        
        // const filePath = this.getGlobalValuePath();


        try {
            const filePath = this.getGlobalValuePath();
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            var leaves = []
            for (const line of lines) {
                if (line) {
                    const [value, timestamp, blockHash] = line.split(',');
                    leaves.push(keccakTreeHasher(BigInt(value), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash))))
                }
            }
            return await this.createMerkelTree(defaultDepth, leaves);
        } catch (e) {
            console.log(e)
            return await this.createMerkelTree(defaultDepth, []);
        }
        // try {
        //     const content = await fs.readFile(filePath, 'utf-8');
        //     const leaves = content.split('\n')
        //         .filter(line => line.trim())
        //         .map(line => line.split(',')[0]);
        //     return await createMimcMerkelTree(defaultDepth, leaves);
        // } catch {
        //     return await createMimcMerkelTree(defaultDepth, []);
        // }
    }

    async getGlobalRootTree(): Promise<MerkleTree> {
        const filePath = this.getGlobalRootPath();
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const leaves = content.split('\n').filter(line => line.trim());
            return await this.createMerkelTree(defaultDepth, leaves);
        } catch {
            return await this.createMerkelTree(defaultDepth, []);
        }
    }

    async storeLocalTree(globalTreeIndex: number, merkleTree: MerkleTree): Promise<void> {
        const filePath = this.getLocalTreePath(globalTreeIndex);
        const leaves = merkleTree.elements.map(leaf => leaf.toString());
        await fs.writeFile(filePath, leaves.join('\n') + '\n');
    }

    async detectLocalTreesAvailable(max_global_tree_index: number): Promise<boolean> {
        let result: boolean = true;
        for (let i = 0; i < max_global_tree_index; i++) {
            const filePath = this.getLocalTreePath(i);
            try {
                await fs.access(filePath);
            } catch {
                result = false;
            }
        }
        return result;
    }

    async getOnChainPublishingState(): Promise<OnChainPublishingState> {
        const filePath = path.join(this.folderPath, this.ON_CHAIN_PUBLISHING_STATE_FILE);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return { processing_local_tree: -1, local_trees_to_process: [] };
        }
    }

    async setOnChainPublishingState(state: OnChainPublishingState): Promise<void> {
        const filePath = path.join(this.folderPath, this.ON_CHAIN_PUBLISHING_STATE_FILE);
        await fs.writeFile(filePath, JSON.stringify(state));
    }
}
