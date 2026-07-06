// import { buildPoseidon } from "circomlibjs";
// import { HexString } from "../../types/protocol/common";
// import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'
// import { buffer2HexString, hexString2Buffer } from "nihilium-circuits/utils/tools";
// import { IDataStream, ZERO } from "./types";

// /**
//  * In Memory Data stream for testing purposes
//  */
// export class InMemoryDataStream implements IDataStream {
//     private id: string;
//     private merkleTree: MerkleTree;
//     private globalTree: MerkleTree;//TODO use this to store the global tree
//     private depth: number;
//     private poseidon: any;


//     //Used for testing purposes
//     private max_local_tree_elements: number = 50;
//     private local_trees: [MerkleTree, number][] = [];


//     private hashFunction: (left: any, right: any) => string;
//     constructor(id:string, depth: number = 20, max_local_tree_elements: number = 10) {
//         this.depth = depth
//         this.id = id
//         this.merkleTree = new MerkleTree(depth, [])
//         this.globalTree = new MerkleTree(depth, [])
//         this.hashFunction = (left, right) => {return ""}
//         this.max_local_tree_elements = max_local_tree_elements
//         this.local_trees = []
//     }
//     hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
//     hasValueRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};

//     async initialize(): Promise<void> {
//         this.poseidon = await buildPoseidon()
//         this.hashFunction = (left, right) => {
//             return buffer2HexString(this.poseidon([hexString2Buffer(left), hexString2Buffer(right)]))
//         }
//         this.merkleTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
//         this.globalTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
//     }

//     getID(): string {
//         return this.id
//     }

//     async isProvable(global_index: number, local_index: number): Promise<boolean> {
//         //Check if the global tree has the global index
//         if (!this.local_trees[global_index]) {
//             return false
//         }
//         //Check if the local tree has the local index
//         if (!this.local_trees[global_index][0].elements[local_index]) {
//             return false
//         }
//         return true
//     }

//     insertData(data: HexString[]): void {
//         this.merkleTree.bulkInsert(data)
//     }

//     async postData(data: HexString): Promise<[number, number]> {
        
//         this.merkleTree.insert(data)
//         //We add plus one to the global index as this the next index where to local tree is inserted
//         //NOTE: in a smart contract situation this might need better async capabilities
//         var toReturn: [number, number] = [this.globalTree.elements.length + 1,this.merkleTree.elements.length]
//         //If full we upgrade to the next global index
//         if(this.merkleTree.elements.length >= this.max_local_tree_elements) {
//             var timestamp = Date.now()
//             this.globalTree.insert(this.hashFunction(this.merkleTree.root, timestamp.toString(16)))
//             this.local_trees.push([this.merkleTree, timestamp])
//             this.merkleTree = new MerkleTree(this.depth, [], {hashFunction: this.hashFunction, zeroElement: ZERO.toString(16)})
//         }
        
//         return toReturn;
//     }

//     async getProof(global_index: number, local_index: number): Promise<[ProofPath, ProofPath]> {
//         if(!this.isProvable( global_index, local_index)){
//             throw new Error("Not provable")
//         }
//         const globalProof = this.globalTree.proof(this.poseidon[this.local_trees[global_index][0].root, this.local_trees[global_index][1].toString(16)])
//         const proof = this.merkleTree.proof(this.merkleTree.elements[local_index])
        
//         return [globalProof, proof]
//     }   

// }
