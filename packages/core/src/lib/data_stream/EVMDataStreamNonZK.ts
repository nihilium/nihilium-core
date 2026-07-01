
// import { HexString } from "../../types/protocol/common";
// import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'
// import process from 'node:process';
// import { IDataStream } from "./types";
// import { toPaddedHex, keccakTreeHasher, createKeccakMerkelTree, signDataInsertRequestJWT } from "../utils";

// import { IDataStreamPersistence, OnChainPublishingState } from "../persistence/types";
// import { assert, Signer } from "ethers";

// import { cryptoTools } from "@nihilium/zkp-circuits";
// import { EmpheralMerkleTreeWrapper } from "../contract_wrappers/EmpheralMerkleTreeWrapper";



// /**
//  * In Memory Data stream for testing purposes
//  */
// export class EVMDataStreamNonZK implements IDataStream {
//     private id: string;
//     private merkleTree: MerkleTree;
//     private globalRootTree: MerkleTree;//TODO use this to store the global tree
//     private globalValueTree: MerkleTree;//TODO use this to store the global tree
//     private globalLeafTimestamps: Map<string, number>;
//     private globalLeafBlockHashes: Map<string, string>;
//     private depth: number;
//     private poseidon: any;
//     private signer: Signer;
//     private persistence: IDataStreamPersistence;
//     private global_evm_merkle_tree:EmpheralMerkleTreeWrapper;
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
//     private postDataLock: Promise<void> = Promise.resolve();

//     constructor(id:string, persistence:IDataStreamPersistence, global_tree_address:string, 
//         signer: Signer,
//         publishing_interval_in_seconds: number = 10,
//         depth: number = 24, max_local_tree_elements: number = -1,
//         forced_publication_interval_in_seconds: number = -1) {
//         this.depth = depth
//         this.id = id
//         this.persistence = persistence
//         this.merkleTree = new MerkleTree(depth, [])
//         this.globalRootTree = new MerkleTree(depth, [])        
//         this.globalValueTree = new MerkleTree(depth, [])
//         this.globalLeafTimestamps = new Map<string, number>()
//         this.globalLeafBlockHashes = new Map<string, string>()
//         this.max_local_tree_elements = max_local_tree_elements > 0 ? max_local_tree_elements : (2 ** depth - 1)- 1000 //The -1000 is just to allow for some overflow
//         this.local_trees = []
//         this.signer = signer
//         this.global_evm_merkle_tree = new EmpheralMerkleTreeWrapper(signer)
//         this.global_tree_address = global_tree_address
//         this.publishing_interval_in_seconds = publishing_interval_in_seconds
//         this.forced_publication_interval_in_seconds = forced_publication_interval_in_seconds
//     }
//     hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
//     hasValueRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
//     getUrl(): string {
//         return this.id
//     }

//     async load_everything(): Promise<void> {
//         this.global_evm_merkle_tree = new EmpheralMerkleTreeWrapper(this.signer)
//         await this.global_evm_merkle_tree.attach(this.global_tree_address)
//         this.on_chain_publishing_state = await this.persistence.getOnChainPublishingState()
        
//         this.merkleTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex())
//         this.globalRootTree = await this.persistence.getGlobalRootTree()
//         this.globalValueTree = await this.persistence.getGlobalValueTree()
//         this.globalLeafTimestamps = await this.persistence.getGlobalLeafTimestamps()
//         this.globalLeafBlockHashes = await this.persistence.getGlobalLeafBlockHashes()
//     }
    
//     async initialize(): Promise<void> {
//         await this.load_everything()
//         await this.resyncGlobalTree()
//         if(this.on_chain_publishing_state.processing_local_tree >= 0 && this.on_chain_publishing_state.local_trees_to_process.length > 0) {
//             await this.processGlobalTreeInsert(true)
//         }
//         //We just add some random value to avoid generating similar roots
//         await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
//         setInterval(async () => {
//             // await this.closeLocalTree()
//             await this.processGlobalTreeInsert()
//         }, 3000)

//         if(this.forced_publication_interval_in_seconds > 0) {
//             setInterval(async () => {
//                 console.log("Forced publication")
//                 await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
//             }, this.forced_publication_interval_in_seconds * 1000)
//         }
//     }

//     async resyncGlobalTree(force: boolean = false): Promise<void> {
//         const currentContractGlobalTreeIndex = await this.global_evm_merkle_tree.getCurrentIndex()
//         const currentContractGlobalRoot = await this.global_evm_merkle_tree.getLastMerkleRoot()
//         const isKnown = await this.global_evm_merkle_tree.isKnownValueRoot(this.globalValueTree.root.toString())
//         console.log("Current contract global root", currentContractGlobalRoot)
//         console.log("Current global root", this.globalValueTree.root, isKnown)
//         console.log("Current contract global tree index", currentContractGlobalTreeIndex)
//         console.log("Current global tree index", this.getGlobalTreeIndex())
//         console.log("Requires resync", force || currentContractGlobalTreeIndex > this.getGlobalTreeIndex())
//         var localGlobalTree = await createKeccakMerkelTree(this.depth, [])
//         var hasher = keccakTreeHasher;

//         if(force || currentContractGlobalRoot != this.globalValueTree.root) {
//             try{
//             const lastInsertEvent = await this.global_evm_merkle_tree.getLastInsertEvent()
//             //const minusTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex() - 1)
//             //const minusTreeRoot = minusTree.root
//             // const minusTreeLeaf = hasher(minusTreeRoot, lastInsertEvent.timestamp)
//             // const localRoot = this.merkleTree.root
//             const localLeaf = hasher(lastInsertEvent.newValueRoot, hasher(lastInsertEvent.timestamp, BigInt(lastInsertEvent.blockHash)))
//             this.globalValueTree.insert(localLeaf)
//             if(this.globalValueTree.root != currentContractGlobalRoot) {
//                 console.log("Global tree root does not match", this.globalValueTree.root, currentContractGlobalRoot)
//                 force = true
//             }else{
//                 await this.persistence.storeGlobalValueTreeLeaf(lastInsertEvent.newValueRoot, Number(lastInsertEvent.timestamp), lastInsertEvent.blockHash)
//                 this.on_chain_publishing_state.processing_local_tree = -1
//                 this.on_chain_publishing_state.local_trees_to_process.shift()
//                 await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//                 console.log("Recovered from last unseen", lastInsertEvent)
//             }
              
//             } catch (error) {
//                 console.error("Error getting last insert event", error)
//                 force = true
//             }
//         }

        
//         if(force || currentContractGlobalTreeIndex > this.getGlobalTreeIndex()) {
//             const events = await this.global_evm_merkle_tree.getTreeUpdateEvents()
//             await this.persistence.resetContractTrees()
           
//             for(const event of events) {
//                 await this.persistence.storeGlobalValueTreeLeaf(toPaddedHex(event.value), event.timestamp, toPaddedHex(event.blockHash))
//             }
            
//         }
        
        
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
//         var hashed = keccakTreeHasher(BigInt(value), 0n);
//         var indexes = (await this.persistence.getIndexedLocalLeaf(keccakTreeHasher(BigInt(value), 0n)))
//         if(indexes.length === 0) {
//             return false
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
//             console.log("Closing local tree, elements length", this.merkleTree.elements.length)
//             this.merkleTree =  await createKeccakMerkelTree(this.depth, [])
            
//             this.on_chain_publishing_state.local_trees_to_process.push(this.getGlobalTreeIndex())
//             this.lastKnownTimestamp = Date.now()
//             await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//         }
//     }

//     private async processGlobalTreeInsert(force: boolean = false){
        
//         await this.closeLocalTree()
//         try{
//             if(force || (this.on_chain_publishing_state.processing_local_tree == -1 && this.on_chain_publishing_state.local_trees_to_process.length > 0)) {
//                 console.log("Processing global tree insert 2")
//                 this.on_chain_publishing_state.processing_local_tree = this.on_chain_publishing_state.local_trees_to_process[0]
//                 await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//                 var localTree = await this.persistence.getLocalTree(this.on_chain_publishing_state.processing_local_tree )
//                 var previousLeaf = this.globalValueTree.elements.at(-1)?.toString()
//                 var insert_value_proof = this.globalValueTree.path(this.globalValueTree.elements.length - 1).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
//                 var newSubTreeRoot = toPaddedHex(BigInt(localTree.root))
//                 console.log("Inserting value proof",newSubTreeRoot, previousLeaf, this.globalValueTree.path(this.globalValueTree.elements.length - 1))
//                 var {index, timestamp, blockHash, newValueRoot} = await this.global_evm_merkle_tree.insert(
//                     previousLeaf || "",
//                     newSubTreeRoot,
//                     insert_value_proof);

//                 if (!timestamp){
//                     console.log("No timestamp found for local tree", newSubTreeRoot)
//                 }
//                 var localLeafHash = keccakTreeHasher(BigInt(newSubTreeRoot), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash)))
//                 this.globalValueTree.insert(localLeafHash)
//                 if(toPaddedHex(BigInt(newValueRoot)) != toPaddedHex(BigInt(this.globalValueTree.root))){
//                     console.log("New value root does not match", toPaddedHex(BigInt(newSubTreeRoot)), toPaddedHex(BigInt(this.globalValueTree.root)))
//                 }
//                 this.globalLeafTimestamps.set(newSubTreeRoot, timestamp)
//                 this.globalLeafBlockHashes.set(newSubTreeRoot, blockHash)
//                 await this.persistence.storeGlobalValueTreeLeaf(newSubTreeRoot.toString(), timestamp, blockHash)
//                 //await this.persistence.storeGlobalRootTreeLeaf(newMerkleRoot.toString())
//                 this.on_chain_publishing_state.processing_local_tree = -1
//                 this.on_chain_publishing_state.local_trees_to_process.shift()
//                 await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
               
//             }
//         } catch (error) {
//             console.error("Error processing global tree insert", error)
            
//             await this.load_everything()
//             await this.resyncGlobalTree()
//             await this.processGlobalTreeInsert(true)
//             //Temp solution to let docker restart the container
//             process.exit(-1)
//             // this.on_chain_publishing_state.processing_local_tree = -1
//             // this.on_chain_publishing_state.local_trees_to_process.shift()
//             // await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
//         }
//     }

//     async postData(data: HexString[]): Promise<[number, number, string]> {
//         //TODO there might be a cleaner approach for this but probably has to come from the data-storage
//         // Acquire lock - wait for previous operation to complete
//         await this.postDataLock;
        
//         // Create new lock promise for next operation
//         let releaseLock: () => void;
//         this.postDataLock = new Promise<void>((resolve) => {
//             releaseLock = resolve;
//         });
        
//         try {
//             var hashedData = data.map(d => keccakTreeHasher(d, 0n))
//             var inserted_at = this.merkleTree.elements.length;
//             for(const leaf of hashedData){
//                 //We insert with +1 if the global index is the next one to be inserted
//                 await this.persistence.storeLocalTreeLeaf(this.getGlobalTreeIndex() + this.on_chain_publishing_state.local_trees_to_process.length, this.merkleTree.elements.length, leaf)
//                 this.merkleTree.insert(leaf)
//             }
//             //await this.closeLocalTree()
//             //await this.processGlobalTreeInsert()
//             //this.merkleTree.bulkInsert(hashedData)
//             //We add plus one to the global index as this the next index where to local tree is inserted
//             //NOTE: in a smart contract situation this might need better async capabilities
//             var signature = await signDataInsertRequestJWT(data, this.getGlobalTreeIndex(), inserted_at, this.signer)
//             //TODO handle multiple inserts, now itreturns the last local tree index
//             var toReturn: [number, number, string] = [this.getGlobalTreeIndex(),inserted_at, signature];

//             //If full we upgrade to the next global index
//             // if(this.merkleTree.elements.length >= this.max_local_tree_elements) {
//             //     var timestamp = Date.now()
//             //       this.globalTree.insert(this.hashFunction(this.merkleTree.root, timestamp.toString(16)))
//             //     this.local_trees.push([this.merkleTree, timestamp])
//             //     this.merkleTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
//             // }
            
//             return toReturn;
//         } finally {
//             // Release lock
//             releaseLock!();
//         }
//     }

//     async getLatestGlobalLeafProof(): Promise<[ProofPath, string, number, number, string]> {
//         const localTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex() - 1)
//         console.log("Local tree", this.getGlobalTreeIndex() - 1, localTree.root, localTree.elements.length)
//         const rootKey = toPaddedHex(BigInt(localTree.root))
//         const timestamp: number = this.globalLeafTimestamps.get(rootKey) || 0
//         const blockHash: string = this.globalLeafBlockHashes.get(rootKey) || "0x0"
//         console.log("Timestamp", timestamp)
//         const globalProof = this.globalValueTree.proof(keccakTreeHasher(BigInt(localTree.root), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash))))
//         console.log("Global proof", globalProof)
//         return [globalProof, rootKey, timestamp, this.getGlobalTreeIndex() - 1, blockHash]
//     }


//     //TODO make this a proper return type
//     //Return type: [globalProof: ProofPath, localProof: ProofPath, timestamp: number, globalIndex: number, localIndex: number][]
//     async getProof(value: HexString): Promise<[ProofPath, ProofPath, number, number, number, string]> {
//         if(!(await this.isProvable(value))){
//             throw new Error("Not provable")
//         }
//         var indexes = (await this.persistence.getIndexedLocalLeaf(keccakTreeHasher(BigInt(value), 0n)))
//         var indexes2 = indexes[0]
//         var localTree = await this.persistence.getLocalTree(indexes2[0])
//         const proof = localTree.path(indexes2[1])
//         const rootKey = toPaddedHex(BigInt(localTree.root))
//         const timestamp: number = this.globalLeafTimestamps.get(rootKey) || 0
//         const blockHash: string = this.globalLeafBlockHashes.get(rootKey) || "0x0"

//         const globalProof = this.globalValueTree.proof(keccakTreeHasher(BigInt(localTree.root), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash))))

//         return [globalProof, proof, timestamp, indexes2[0], indexes2[1], blockHash]
//     }   

// }
