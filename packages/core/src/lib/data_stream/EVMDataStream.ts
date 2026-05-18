
// import { HexString } from "../../types/protocol/common";
// import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'

// import { IDataStream } from "./types";
// import { createMimcMerkelTree, toPaddedHex, treeHasher } from "../utils";
// import { cryptoTools } from "@nihilium/zkp-circuits";
// import { IDataStreamPersistence, OnChainPublishingState } from "../persistence/types";
// import { assert, Signer } from "ethers";

// import { DualMerkleTreeWrapperDeprecated } from "../contract_wrappers/DualMerkleTreeWrapper";
// // import { generateRandom248BitNumber } from "@nihilium/noir-circuits/utils/tools";



// /**
//  * In Memory Data stream for testing purposes
//  */
// export class EVMDataStreamDeprecated implements IDataStream {
//     private id: string;
//     private merkleTree: MerkleTree;
//     private globalRootTree: MerkleTree;//TODO use this to store the global tree
//     private globalValueTree: MerkleTree;//TODO use this to store the global tree
//     private globalLeafTimestamps: Map<string, number>;
//     private depth: number;
//     private poseidon: any;
//     private signer: Signer;
//     private persistence: IDataStreamPersistence;
//     private global_evm_merkle_tree:DualMerkleTreeWrapperDeprecated;
//     private publishing_interval_in_seconds: number;
//     //Used for testing purposes
//     private lastKnownTimestamp: number = 0;
//     private max_local_tree_elements: number = 50;
//     private global_tree_address: string;
//     private local_trees: [MerkleTree, number][] = [];
//     private forced_publication_interval_in_seconds: number = -1;
//     private on_chain_publishing_state: OnChainPublishingState = {
//         processing_local_tree: -1,
//         local_trees_to_process: []
//     }

//     constructor(id:string, persistence:IDataStreamPersistence, global_tree_address:string, 
//         signer: Signer,
//         publishing_interval_in_seconds: number = 10,
//         depth: number = 20, max_local_tree_elements: number = -1,
//         forced_publication_interval_in_seconds: number = -1) {
//         this.depth = depth
//         this.id = id
//         this.persistence = persistence
//         this.merkleTree = new MerkleTree(depth, [])
//         this.globalRootTree = new MerkleTree(depth, [])        
//         this.globalValueTree = new MerkleTree(depth, [])
//         this.globalLeafTimestamps = new Map<string, number>()
//         this.max_local_tree_elements = max_local_tree_elements > 0 ? max_local_tree_elements : (2 ** depth - 1)- 1000 //The -1000 is just to allow for some overflow
//         this.local_trees = []
//         this.signer = signer
//         this.global_evm_merkle_tree = new DualMerkleTreeWrapperDeprecated(signer)
//         this.global_tree_address = global_tree_address
//         this.publishing_interval_in_seconds = publishing_interval_in_seconds
//         this.forced_publication_interval_in_seconds = forced_publication_interval_in_seconds
//     }
//     hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
//     hasValueRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};

//     async initialize(): Promise<void> {
        
//         this.on_chain_publishing_state = await this.persistence.getOnChainPublishingState()
//         await this.global_evm_merkle_tree.attach(this.global_tree_address)
//         // var last_root = await this.global_evm_merkle_tree.getLastMerkleRoot()
//         // var last_value_root = await this.global_evm_merkle_tree.getValueIndex()
//         this.merkleTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex())
//        // var globalLeafs = await this.persistence.getGlobalValueTree()
//         this.globalRootTree = await this.persistence.getGlobalRootTree()
//         this.globalValueTree = await this.persistence.getGlobalValueTree()
//         //var is_known_value_root = await this.global_evm_merkle_tree.isKnownValueRoot(toPaddedHex(BigInt(this.globalValueTree.root)))
//         this.globalLeafTimestamps = await this.persistence.getGlobalLeafTimestamps()
//         console.log("Global tree index", this.getGlobalTreeIndex())
//         await this.resyncGlobalTree()
//         if(this.on_chain_publishing_state.processing_local_tree >= 0 && this.on_chain_publishing_state.local_trees_to_process.length > 0) {
//             await this.processGlobalTreeInsert(true)
//         }
//         //We just add some random value to avoid generating similar roots
//         await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
//         setInterval(async () => {
//             // await this.closeLocalTree()
//             await this.processGlobalTreeInsert()
//         }, 1000)

//         if(this.forced_publication_interval_in_seconds > 0) {
//             setInterval(async () => {
//                 await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
//             }, this.forced_publication_interval_in_seconds * 1000)
//         }
//     }

//     async resyncGlobalTree(): Promise<void> {
//         const events = await this.global_evm_merkle_tree.getTreeUpdateEvents()
//         await this.persistence.resetContractTrees()
//         var localGlobalTree = await createMimcMerkelTree(this.depth, [])
//         var hasher = treeHasher;
//         for(const event of events) {
//             await this.persistence.storeGlobalValueTreeLeaf(toPaddedHex(event.value), event.timestamp)
//             await this.persistence.storeGlobalRootTreeLeaf(event.newMerkleRoot.toString())
//             //TODO implement this
//            // this.globalTree.insert(event.newValueRoot.toString(16))
//         }
//         this.globalRootTree = await this.persistence.getGlobalRootTree()
//         this.globalValueTree = await this.persistence.getGlobalValueTree()
//     }

//     getAddress(): string {
//         return this.global_tree_address
//     }

//     getGlobalTreeIndex(): number {
//         return this.globalValueTree.elements.length
//     }

//     async isProvable(value: HexString): Promise<boolean> {
//         //Check if the global tree has the global index
//         var indexes = (await this.persistence.getIndexedLocalLeaf(treeHasher(value, 0n)))
//         if (indexes.length === 0) {
//             return false;
//         }
//         // We do -1 here because globalTree index is the currently inserting one.
//         //Only those at -1 actually have a timestamp and are stored
//         if(indexes[0][0] >= this.getGlobalTreeIndex()) { 
//             return false
//         }
//         var localTree = await this.persistence.getLocalTree(indexes[0][0])
//         if (!localTree) {
//             return false
//         }
//         //Check if the local tree has the local index
//         if (!localTree.elements[indexes[0][1]]) {
//             return false
//         }
//         return true
//     }

//     // insertData(data: HexString[]): void {
//     //     this.merkleTree.bulkInsert(data)
//     // }
    


//     private async closeLocalTree(force: boolean = false){
//         if(force || this.merkleTree.elements.length >= this.max_local_tree_elements || (
//             (Date.now() - this.lastKnownTimestamp > this.publishing_interval_in_seconds * 1000) 
//             && this.merkleTree.elements.length > 1
//             && this.on_chain_publishing_state.processing_local_tree == -1)
//         ) {
//             console.log("Closing local tree")
//             this.merkleTree =  await createMimcMerkelTree(this.depth, [])
            
          
            
            
//             this.on_chain_publishing_state.local_trees_to_process.push(this.getGlobalTreeIndex())
//             this.lastKnownTimestamp = Date.now()
//             await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//         }
//     }

//     private async processGlobalTreeInsert(force: boolean = false){
//         await this.closeLocalTree()
        
//         if(force || (this.on_chain_publishing_state.processing_local_tree == -1 && this.on_chain_publishing_state.local_trees_to_process.length > 0)) {
//             console.log("Processing global tree insert 2")
//             this.on_chain_publishing_state.processing_local_tree = this.on_chain_publishing_state.local_trees_to_process[0]
//             await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//             var localTree = await this.persistence.getLocalTree(this.on_chain_publishing_state.processing_local_tree )
           
//             var newSubTreeRoot = toPaddedHex(BigInt(localTree.root))
//             var {index, timestamp, newValueRoot, leafHash, newMerkleRoot} = await this.global_evm_merkle_tree.insert(newSubTreeRoot, await this.signer.getAddress());
//             if (!timestamp){
//                 console.log("No timestamp found for local tree", newSubTreeRoot)
//             }
//             var localLeafHash = treeHasher(newSubTreeRoot, timestamp)
//             this.globalValueTree.insert(localLeafHash)
//             this.globalLeafTimestamps.set(newSubTreeRoot, timestamp)
//             //assert(leafHash == BigInt(localLeafHash), "Leaf hash does not match")
//             await this.persistence.storeGlobalValueTreeLeaf(newSubTreeRoot.toString(), timestamp)
//             await this.persistence.storeGlobalRootTreeLeaf(newMerkleRoot.toString())
//             this.on_chain_publishing_state.processing_local_tree = -1
//             this.on_chain_publishing_state.local_trees_to_process.shift()
//             await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//             //We just add a random value to avoid generating similar roots
//             //await this.postData([toPaddedHex(generateRandom248BitNumber())])
//         }
//     }

//     async postData(data: HexString[]): Promise<[number, number]> {
//         var hashedData = data.map(d => treeHasher(d, 0n))
//         for(const leaf of hashedData){
//             //We insert with +1 if the global index is the next one to be inserted
//             await this.persistence.storeLocalTreeLeaf(this.getGlobalTreeIndex() + this.on_chain_publishing_state.local_trees_to_process.length, this.merkleTree.elements.length, leaf)
//             this.merkleTree.insert(leaf)
//         }
//         //await this.closeLocalTree()
//         //await this.processGlobalTreeInsert()
//         //this.merkleTree.bulkInsert(hashedData)
//         //We add plus one to the global index as this the next index where to local tree is inserted
//         //NOTE: in a smart contract situation this might need better async capabilities
//         //TODO handle multiple inserts, now itreturns the last local tree index
//         var toReturn: [number, number] = [this.getGlobalTreeIndex(),this.merkleTree.elements.length]
//         //If full we upgrade to the next global index
//         // if(this.merkleTree.elements.length >= this.max_local_tree_elements) {
//         //     var timestamp = Date.now()
//         //       this.globalTree.insert(this.hashFunction(this.merkleTree.root, timestamp.toString(16)))
//         //     this.local_trees.push([this.merkleTree, timestamp])
//         //     this.merkleTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
//         // }
        
//         return toReturn;
//     }

//     async getProof(value: HexString): Promise<[ProofPath, ProofPath, number, number, number]> {
//         if(!this.isProvable( value)){
//             throw new Error("Not provable")
//         }
//         //We can assume it exists because of isProvable
//         var indexes = (await this.persistence.getIndexedLocalLeaf(treeHasher(value, 0n)))[0]
//         var localTree = await this.persistence.getLocalTree(indexes [0])
//         const proof = localTree.path(indexes[1])
//         const timestamp: number = this.globalLeafTimestamps.get(toPaddedHex(BigInt(localTree.root))) || 0
        
//         const globalProof = this.globalValueTree.proof(treeHasher(localTree.root, timestamp))
//         //const localTree = await this.persistence.getLocalTree(indexes[0])
        
        
//         return [globalProof, proof, timestamp, indexes[0],indexes [1]]
//     }   

// }
