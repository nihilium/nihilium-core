
import { HexString } from "../../types/protocol/common";
import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'

import { IDataStream } from "./types";
import { toPaddedHex, keccakTreeHasher, createKeccakMerkelTree } from "../utils";

import { IDataStreamPersistence, OnChainPublishingState } from "../persistence/types";
import { assert, Signer } from "ethers";

import { cryptoTools } from "@nihilium/zkp-circuits";
import { EmpheralMerkleTreeWrapper } from "../contract_wrappers/EmpheralMerkleTreeWrapper";



/**
 * In Memory Data stream for testing purposes
 */
export class EVMDataStreamNonZK implements IDataStream {
    private id: string;
    private merkleTree: MerkleTree;
    private globalRootTree: MerkleTree;//TODO use this to store the global tree
    private globalValueTree: MerkleTree;//TODO use this to store the global tree
    private globalLeafTimestamps: Map<string, number>;
    private depth: number;
    private poseidon: any;
    private signer: Signer;
    private persistence: IDataStreamPersistence;
    private global_evm_merkle_tree:EmpheralMerkleTreeWrapper;
    private publishing_interval_in_seconds: number;
    
    //Used for testing purposes
    private lastKnownTimestamp: number = 0;
    private max_local_tree_elements: number = 50;
    private global_tree_address: string;
    private local_trees: [MerkleTree, number][] = [];
    private forced_publication_interval_in_seconds: number = -1;
    private on_chain_publishing_state: OnChainPublishingState = {
        processing_local_tree: -1,
        local_trees_to_process: []
    }

    constructor(id:string, persistence:IDataStreamPersistence, global_tree_address:string, 
        signer: Signer,
        publishing_interval_in_seconds: number = 10,
        depth: number = 20, max_local_tree_elements: number = -1,
        forced_publication_interval_in_seconds: number = -1) {
        this.depth = depth
        this.id = id
        this.persistence = persistence
        this.merkleTree = new MerkleTree(depth, [])
        this.globalRootTree = new MerkleTree(depth, [])        
        this.globalValueTree = new MerkleTree(depth, [])
        this.globalLeafTimestamps = new Map<string, number>()
        this.max_local_tree_elements = max_local_tree_elements > 0 ? max_local_tree_elements : (2 ** depth - 1)- 1000 //The -1000 is just to allow for some overflow
        this.local_trees = []
        this.signer = signer
        this.global_evm_merkle_tree = new EmpheralMerkleTreeWrapper(signer)
        this.global_tree_address = global_tree_address
        this.publishing_interval_in_seconds = publishing_interval_in_seconds
        this.forced_publication_interval_in_seconds = forced_publication_interval_in_seconds
    }
    hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
    hasValueRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
    getUrl(): string {
        return this.id
    }

    async load_everything(): Promise<void> {
        this.global_evm_merkle_tree = new EmpheralMerkleTreeWrapper(this.signer)
        await this.global_evm_merkle_tree.attach(this.global_tree_address)
        this.on_chain_publishing_state = await this.persistence.getOnChainPublishingState()
        
        this.merkleTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex())
        this.globalRootTree = await this.persistence.getGlobalRootTree()
        this.globalValueTree = await this.persistence.getGlobalValueTree()
        this.globalLeafTimestamps = await this.persistence.getGlobalLeafTimestamps()
    }
    
    async initialize(): Promise<void> {
        await this.load_everything()
        await this.resyncGlobalTree()
        if(this.on_chain_publishing_state.processing_local_tree >= 0 && this.on_chain_publishing_state.local_trees_to_process.length > 0) {
            await this.processGlobalTreeInsert(true)
        }
        //We just add some random value to avoid generating similar roots
        await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
        setInterval(async () => {
            // await this.closeLocalTree()
            await this.processGlobalTreeInsert()
        }, 3000)

        if(this.forced_publication_interval_in_seconds > 0) {
            setInterval(async () => {
                await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
            }, this.forced_publication_interval_in_seconds * 1000)
        }
    }

    async resyncGlobalTree(force: boolean = false): Promise<void> {
        const currentContractGlobalTreeIndex = await this.global_evm_merkle_tree.getCurrentIndex()
        const currentContractGlobalRoot = await this.global_evm_merkle_tree.getLastMerkleRoot()
        const isKnown = await this.global_evm_merkle_tree.isKnownValueRoot(this.globalValueTree.root.toString())
        console.log("Current contract global root", currentContractGlobalRoot)
        console.log("Current global root", this.globalValueTree.root, isKnown)
        console.log("Current contract global tree index", currentContractGlobalTreeIndex)
        console.log("Current global tree index", this.getGlobalTreeIndex())
        console.log("Requires resync", force || currentContractGlobalTreeIndex > this.getGlobalTreeIndex())
        var localGlobalTree = await createKeccakMerkelTree(this.depth, [])
        var hasher = keccakTreeHasher;

        if(force || currentContractGlobalRoot != this.globalValueTree.root) {
            const lastInsertEvent = await this.global_evm_merkle_tree.getLastInsertEvent()
            const minusTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex() - 1)
            const minusTreeRoot = minusTree.root
            const minusTreeLeaf = hasher(minusTreeRoot, lastInsertEvent.timestamp)
            const localRoot = this.merkleTree.root
            const localLeaf = hasher(lastInsertEvent.newValueRoot, lastInsertEvent.timestamp)
            this.globalValueTree.insert(localLeaf)
            if(this.globalValueTree.root != currentContractGlobalRoot) {
                console.log("Global tree root does not match", this.globalValueTree.root, currentContractGlobalRoot)
                force = true
            }else{
                await this.persistence.storeGlobalValueTreeLeaf(lastInsertEvent.newValueRoot, Number(lastInsertEvent.timestamp))
                this.on_chain_publishing_state.processing_local_tree = -1
                this.on_chain_publishing_state.local_trees_to_process.shift()
                await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
                console.log("Recovered from last unseen", lastInsertEvent)
            }
                //await this.persistence.storeGlobalRootTreeLeaf(event.newMerkleRoot.toString())
                //TODO implement this
                // this.globalTree.insert(event.newValueRoot.toString(16))
        }

        
        if(force || currentContractGlobalTreeIndex > this.getGlobalTreeIndex()) {
            const events = await this.global_evm_merkle_tree.getTreeUpdateEvents()
            await this.persistence.resetContractTrees()
           
            for(const event of events) {
                await this.persistence.storeGlobalValueTreeLeaf(toPaddedHex(event.value), event.timestamp)
                //await this.persistence.storeGlobalRootTreeLeaf(event.newMerkleRoot.toString())
                //TODO implement this
            // this.globalTree.insert(event.newValueRoot.toString(16))
            }
            //this.globalRootTree = await this.persistence.getGlobalRootTree()
            //this.globalValueTree = await this.persistence.getGlobalValueTree()
        }
        //The tree was updated but the process got shutdown whilst updating our global tree
       
        
        this.globalValueTree = await this.persistence.getGlobalValueTree()
    }

    getAddress(): string {
        return this.global_tree_address
    }

    getGlobalTreeIndex(): number {
        return this.globalValueTree.elements.length
    }


    async isProvable(value: HexString): Promise<boolean> {
        //Check if the global tree has the global index
        var hashed = keccakTreeHasher(BigInt(value), 0n);
        var indexes = (await this.persistence.getIndexedLocalLeaf(keccakTreeHasher(BigInt(value), 0n)))
        if(indexes.length === 0) {
            return false
        }
        // We do -1 here because globalTree index is the currently inserting one.
        //Only those at -1 actually have a timestamp and are stored
        if(indexes[0][0] >= this.getGlobalTreeIndex()) { 
            return false
        }
        var localTree = await this.persistence.getLocalTree(indexes[0][0])
        if (!localTree) {
            return false
        }
        //Check if the local tree has the local index
        if (!localTree.elements[indexes[0][1]]) {
            return false
        }
        return true
    }

    // insertData(data: HexString[]): void {
    //     this.merkleTree.bulkInsert(data)
    // }
    


    private async closeLocalTree(force: boolean = false){
        if(force || this.merkleTree.elements.length >= this.max_local_tree_elements || (
            (Date.now() - this.lastKnownTimestamp > this.publishing_interval_in_seconds * 1000) 
            && this.merkleTree.elements.length > 1
            && this.on_chain_publishing_state.processing_local_tree == -1)
        ) {
            console.log("Closing local tree")
            this.merkleTree =  await createKeccakMerkelTree(this.depth, [])
            
          
            
            
            this.on_chain_publishing_state.local_trees_to_process.push(this.getGlobalTreeIndex())
            this.lastKnownTimestamp = Date.now()
            await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
        }
    }

    private async processGlobalTreeInsert(force: boolean = false){
        
        await this.closeLocalTree()
        try{
            if(force || (this.on_chain_publishing_state.processing_local_tree == -1 && this.on_chain_publishing_state.local_trees_to_process.length > 0)) {
                console.log("Processing global tree insert 2")
                this.on_chain_publishing_state.processing_local_tree = this.on_chain_publishing_state.local_trees_to_process[0]
                await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
                var localTree = await this.persistence.getLocalTree(this.on_chain_publishing_state.processing_local_tree )
                var previousLeaf = this.globalValueTree.elements.at(-1)?.toString()
                var insert_value_proof = this.globalValueTree.path(this.globalValueTree.elements.length - 1).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
                var newSubTreeRoot = toPaddedHex(BigInt(localTree.root))
                
                var {index, timestamp, newValueRoot, leafHash, gasUsed} = await this.global_evm_merkle_tree.insert(
                    previousLeaf || "",
                    newSubTreeRoot, 
                    insert_value_proof); 
            
                //var {index, timestamp, newValueRoot, leafHash, newMerkleRoot} = await this.global_evm_merkle_tree.insert(newSubTreeRoot, await this.signer.getAddress());
                if (!timestamp){
                    console.log("No timestamp found for local tree", newSubTreeRoot)
                }
                var localLeafHash = keccakTreeHasher(newSubTreeRoot, timestamp)
                this.globalValueTree.insert(localLeafHash)
                if(toPaddedHex(BigInt(newValueRoot)) != toPaddedHex(BigInt(this.globalValueTree.root))){
                    console.log("New value root does not match", toPaddedHex(BigInt(newSubTreeRoot)), toPaddedHex(BigInt(this.globalValueTree.root)))
                }
                this.globalLeafTimestamps.set(newSubTreeRoot, timestamp)
                //assert(leafHash == BigInt(localLeafHash), "Leaf hash does not match")
                await this.persistence.storeGlobalValueTreeLeaf(newSubTreeRoot.toString(), timestamp)
                //await this.persistence.storeGlobalRootTreeLeaf(newMerkleRoot.toString())
                this.on_chain_publishing_state.processing_local_tree = -1
                this.on_chain_publishing_state.local_trees_to_process.shift()
                await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
                //We just add a random value to avoid generating similar roots
                //await this.postData([toPaddedHex(generateRandom248BitNumber())])
            }
        } catch (error) {
            console.error("Error processing global tree insert", error)
            await this.load_everything()
            await this.resyncGlobalTree()
            // this.on_chain_publishing_state.processing_local_tree = -1
            // this.on_chain_publishing_state.local_trees_to_process.shift()
            // await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
        }
    }

    async postData(data: HexString[]): Promise<[number, number]> {
        var hashedData = data.map(d => keccakTreeHasher(d, 0n))
        for(const leaf of hashedData){
            //We insert with +1 if the global index is the next one to be inserted
            await this.persistence.storeLocalTreeLeaf(this.getGlobalTreeIndex() + this.on_chain_publishing_state.local_trees_to_process.length, this.merkleTree.elements.length, leaf)
            this.merkleTree.insert(leaf)
        }
        //await this.closeLocalTree()
        //await this.processGlobalTreeInsert()
        //this.merkleTree.bulkInsert(hashedData)
        //We add plus one to the global index as this the next index where to local tree is inserted
        //NOTE: in a smart contract situation this might need better async capabilities
        //TODO handle multiple inserts, now itreturns the last local tree index
        var toReturn: [number, number] = [this.getGlobalTreeIndex(),this.merkleTree.elements.length]
        //If full we upgrade to the next global index
        // if(this.merkleTree.elements.length >= this.max_local_tree_elements) {
        //     var timestamp = Date.now()
        //       this.globalTree.insert(this.hashFunction(this.merkleTree.root, timestamp.toString(16)))
        //     this.local_trees.push([this.merkleTree, timestamp])
        //     this.merkleTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
        // }
        
        return toReturn;
    }

    async getLatestGlobalLeafProof(): Promise<[ProofPath, string, number, number]> {
        const localTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex() - 1)
        console.log("Local tree", this.getGlobalTreeIndex() - 1, localTree.root, localTree.elements.length)
        const timestamp: number = this.globalLeafTimestamps.get(toPaddedHex(BigInt(localTree.root))) || 0
        console.log("Timestamp", timestamp)
        const globalProof = this.globalValueTree.proof(keccakTreeHasher(localTree.root, timestamp))
        console.log("Global proof", globalProof)
        return [globalProof, toPaddedHex(BigInt(localTree.root)), timestamp, this.getGlobalTreeIndex() - 1]
    }

    async getProof(value: HexString): Promise<[ProofPath, ProofPath, number, number, number]> {
        if(!(await this.isProvable( value))){
            throw new Error("Not provable")
        }
        //We can assume it exists because of isProvable
        var indexes = (await this.persistence.getIndexedLocalLeaf(keccakTreeHasher(BigInt(value), 0n)))
        var indexes2 = indexes[0]
        var localTree = await this.persistence.getLocalTree(indexes2 [0])
        const proof = localTree.path(indexes2[1])
        const timestamp: number = this.globalLeafTimestamps.get(toPaddedHex(BigInt(localTree.root))) || 0
        
        const globalProof = this.globalValueTree.proof(keccakTreeHasher(localTree.root, timestamp))
        //const localTree = await this.persistence.getLocalTree(indexes[0])
        
        
        return [globalProof, proof, timestamp, indexes2[0],indexes2 [1]]
    }   

}
