//Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

import { assert, expect } from "chai";
import { ChainedProof, ProvingState } from "../src/lib/reveal_methods/base_functions/ChainedProof";
import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
import { ethers } from "hardhat";
import { Signer } from "ethers";

import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'
//import { mimcTestCircuit, topLevelMerkleTreeCircuit } from "nihilium-noir-circuits";
import { EmpheralMerkleTreeWrapper } from "../src/lib/contract_wrappers/EmpheralMerkleTreeWrapper";

import { uint8ArrayToHex } from "nihilium-circuits/utils/tools";
import { createKeccakMerkelTree, createMimcMerkelTree, keccakTreeHasher, toPaddedHex, ZERO_KECCAK } from "../src/lib/utils";
var mimc7contract = require("../contracts/mimc7.json");
const levels = 20;


/*
The goal of this function is to take a merkle proof path, it old leaf value and the new leaf value
and use the path to calculate the new root. It assumes a sparse merkle tree with null values for each level

*/

function calculateNewSiblingPath(
    lastIndex: number,
    lastLeafHash: string,
    previousSiblingPath: string[],
    nullValues: string[],
    levels: number = 20
  ): string[] {
    const newIndex = lastIndex + 1;
    const newSiblingPath: string[] = [];
    
    // Find the level where lastIndex and newIndex diverge
    const divergenceLevel = findDivergenceLevel(lastIndex, newIndex, levels);
    
    // Recalculate the tree up to the divergence level
    let currentHash = lastLeafHash;
    for (let level = 0; level < divergenceLevel; level++) {
      const isRight = ((lastIndex & (1 << level)) >> level) === 1;
      const siblingHash = previousSiblingPath[level];
      
      currentHash = isRight
        ? keccakTreeHasher(siblingHash, currentHash)
        : keccakTreeHasher(currentHash, siblingHash);
    }
    
    // Now build the new sibling path
    for (let level = 0; level < levels; level++) {
      if (level < divergenceLevel) {
        // Below divergence: use previous sibling path
        newSiblingPath[level] = previousSiblingPath[level];
      } else if (level === divergenceLevel) {
        // At divergence level: use the computed hash from the previous tree
        newSiblingPath[level] = currentHash;
      } else {
        // Above divergence: use null value
        newSiblingPath[level] = nullValues[level];
      }
    }
    
    return newSiblingPath;
  }
  
  function findDivergenceLevel(a: number, b: number, maxBits: number = 20): number {
    const xor = a ^ b;
    
    // If they're identical, return maxBits
    if (xor === 0) return maxBits;
    
    // Count leading zeros in XOR result
    let leadingZeros = 0;
    for (let i = maxBits - 1; i >= 0; i--) {
      if ((xor & (1 << i)) === 0) {
        leadingZeros++;
      } else {
        break;
      }
    }
    
    return maxBits - 1 - leadingZeros;
  }
  
  function calculateNewRoot(
    lastIndex: number,
    lastLeafHash: string,
    siblingPath: string[],
    newValue: string,
    nullValues: string[],
    levels: number = 20
  ): any {
    const newIndex = lastIndex + 1;
    

    var newPath: string[] = [...siblingPath];
    var currentValueLeaf = lastLeafHash;
    let divergenceLevel = findDivergenceLevel(lastIndex, newIndex, levels);
    var calculatedLevels: string[] = [];
    var divergenceLevelHash = currentValueLeaf;
    for (var i = 0; i < levels; i++) {
      
      if(i == divergenceLevel){
        if(i == 0){
          divergenceLevelHash = lastLeafHash;
        } else {
          divergenceLevelHash = currentValueLeaf;
        }
        newPath[i] = divergenceLevelHash;
      }
      if (((lastIndex & (1<<i)) >> i) == 0) {
       
        currentValueLeaf = keccakTreeHasher(currentValueLeaf, siblingPath[i]);
        
       
     } else {
      
       currentValueLeaf = keccakTreeHasher(siblingPath[i], currentValueLeaf);
       if(i<divergenceLevel){
        newPath[i] = nullValues[i];
       }
       
     }
      
    }
    let currentHash = newValue;
    for (var i = 0; i < levels; i++) {
        if (((newIndex & (1<<i)) >> i) == 0) {
         
            currentHash = keccakTreeHasher(currentHash, newPath[i]);
         
          
        } else {
         
            currentHash = keccakTreeHasher(newPath[i], currentHash);
          
        }
        
      }
    // Calculate the new sibling path for the new index
    
    
    // let currentHash = newValue;
    
    // // Traverse from leaf (level 0) to root (level levels-1)
    // for (let level = 0; level < levels; level++) {
    //   // Check if newIndex is right child at this level
    //   if(((newIndex & (1<<i)) >> i) == 0){
        
    //   }
    //   const isRight = ((newIndex & (1 << level)) >> level) === 1;
      
      
    //   // Compute parent hash: left-right if isRight, else right-left
    //   currentHash = isRight
    //     ? treeHasher(calculatedLevels[level], currentHash)
    //     : treeHasher(currentHash, nullValues[level]);
    // }
    
    return {currentHash: currentHash, newPath: newPath, currentValueLeaf: currentValueLeaf, divergenceLevel: divergenceLevel}; // New root hash
  }

function insertIntoTree(levels: string[], index:number, value:string, zeros: string[]){
    var returnLevels = [...levels]; // new leaf value
    var localValueIndex = index; // new index
    var left: string;
    var right: string;
    
    var currentLevelValueHash = value;
    for (let i = 0; i < levels.length; i++) {
        if (localValueIndex % 2 == 0) {
            left = currentLevelValueHash;
            right = zeros[i].toString();
            returnLevels[i] = currentLevelValueHash;
          } else {
            left = returnLevels[i];
            right = currentLevelValueHash;
          }
          
          currentLevelValueHash = keccakTreeHasher(left, right);
          localValueIndex = Math.floor(localValueIndex / 2);
    //   if (((localValueIndex & (1<<j)) >> j) == 0) {
    //     // Current node is on the left, need sibling on the right
    //     // If path[j] exists, use it; otherwise use zero
    //     currentLevelValueHash = treeHasher(currentLevelValueHash, merkelTree.zeros[j].toString());
        
    //   } else {
    //     // Current node is on the right, need sibling on the left
    //     // If path[j] exists, use it; otherwise use zero
    //     currentLevelValueHash = treeHasher(valuePath[j], currentLevelValueHash);
       
        
    //   }

    }
    return {levels: returnLevels, value: currentLevelValueHash};
}

describe("ChainedProof", () => {
    var chainedProof: ChainedProofWrapper;
    var topLevelMerkleProof: any;
    var topLevelMerkleProofAddress: string;
    var verifierContract: any;
    var verifierContractAddress: string;
    var merkleTreeContract: any;
    var merkleTreeContractAddress: string;
    var randomHex: string;
    var signers: Signer[];
    before("should deploy ChainedProof contract", async () => {
        signers  = (await ethers.getSigners()) as unknown as Signer[];
        randomHex = "0x4b6fe33646684b880256c88bf58afe5fc99af9d6eba454fe68034c03647118dc"
        //const verifier =  new ethers.ContractFactory(mimc7contract.abi, mimc7contract.bytecode, signers[0]);
        const topLevelMerkleProofC = await ethers.getContractFactory("EmpheralMerkleTreeKeccak");
        var merkelTree:MerkleTree = await createKeccakMerkelTree(levels, []);
        var merkelTreeRoots:MerkleTree = await createKeccakMerkelTree(levels, [merkelTree.root.toString()]);
        topLevelMerkleProof = await topLevelMerkleProofC.deploy(signers[0], levels);
        topLevelMerkleProofAddress = await topLevelMerkleProof.getAddress();
        console.log(topLevelMerkleProofAddress);
        
        
        
        //expect(chainedProof).to.be.an("object");
    });
    /**
     * Here we test the creation of a merkle tree in the browser.
     * Post this on chain.
     * Create a merkle proof in the browser
     * And verify the proof on chain
     */
    it("Test full circle keccack merkle proofs", async () => {
       var onChainTree = new EmpheralMerkleTreeWrapper(signers[0]);
       await onChainTree.attach(topLevelMerkleProofAddress);
       
       var merkelTree:MerkleTree = await createKeccakMerkelTree(levels, []);
       var merkelTreeRoots:MerkleTree = await createKeccakMerkelTree(levels, [merkelTree.root.toString()]);
       //var hash = await onChainTree.hash(toPaddedHex(BigInt("0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6")), toPaddedHex(BigInt("0x22cd8c17bd4a296d5b920e5ba18880f6d52ae192f6ab8fb20948ffc9b37671f6")));
       var hash2 = keccakTreeHasher(toPaddedHex(BigInt("0x22cd8c17bd4a296d5b920e5ba18880f6d52ae192f6ab8fb20948ffc9b37671f6")), toPaddedHex(BigInt("0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6")));
       
       let zeros: string[] = [];
       for (let i = 0; i < levels; i++) {
        zeros.push(merkelTree.zeros[i].toString());
       }
    //    var testTreeLll = insertIntoTree(testTree,0, randomHex, merkelTree.zeros.map(z => z.toString()));
    //    testTree = testTreeLll.levels;
       //console.log(hash);
       var leafs: bigint[] = [];
       var values: bigint[] = [];
       var timestamps: number[] = [];
       var previousLeaf = ZERO_KECCAK;
      
       //var insert_value_proof:string[] = merkelTree.layers.map(l => l.pop()?.toString() || "").slice(0, levels);
       var insert_value_proof:string[] = merkelTree.path(0).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
       var insert_root_proof:string[] = merkelTreeRoots.path(0).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
       var tests = 1024

       var averageGasUsed = 0;
       for (let i = 0; i < tests; i++) {
            
            var {index, timestamp, newValueRoot, leafHash, gasUsed} = await onChainTree.insert(previousLeaf,toPaddedHex(BigInt(i + 1)), 
            insert_value_proof);
            averageGasUsed += parseInt(gasUsed);
            var logs = await onChainTree.getLogs();
            console.log(logs.flat());
            var tHash = keccakTreeHasher;
            var leaf = keccakTreeHasher(BigInt(i + 1), timestamp);//timestamp
            var oldRoot = merkelTree.root;
            merkelTree.insert(leaf);
            var newRoot = merkelTree.root;
            var testRoot = calculateNewRoot(i, previousLeaf, insert_value_proof, leaf, zeros, levels);
            previousLeaf = leaf;
            // var testTreeLll = insertIntoTree(testTree,1, leaf, merkelTree.zeros.map(z => z.toString()));
            // testTree = testTreeLll.levels;

       
        //var currentLevelValueHash = leaf;
        var left: string;
        var right: string;
        var valuePath: string[] = insert_value_proof;
        valuePath[0] = previousLeaf;
        var currentLevelValueHash = leaf; // new leaf value
        var localValueIndex = i + 1; // new index
        for (let j = 0; j < levels; j++) {
            if (localValueIndex % 2 == 0) {
                left = currentLevelValueHash;
                right = merkelTree.zeros[j].toString();
                valuePath[j] = currentLevelValueHash;
              } else {
                left = valuePath[j];
                right = currentLevelValueHash;
              }
              
              currentLevelValueHash = keccakTreeHasher(left, right);
              localValueIndex = Math.floor(localValueIndex / 2);
        //   if (((localValueIndex & (1<<j)) >> j) == 0) {
        //     // Current node is on the left, need sibling on the right
        //     // If path[j] exists, use it; otherwise use zero
        //     currentLevelValueHash = treeHasher(currentLevelValueHash, merkelTree.zeros[j].toString());
            
        //   } else {
        //     // Current node is on the right, need sibling on the left
        //     // If path[j] exists, use it; otherwise use zero
        //     currentLevelValueHash = treeHasher(valuePath[j], currentLevelValueHash);
           
            
        //   }
          
        }

       
            assert.equal(BigInt(merkelTree.root), BigInt(newValueRoot));
            //assert.equal(BigInt(leaf), leafHash);
            leafs.push(leaf);
            values.push(BigInt(i + 1));
            timestamps.push(timestamp);
            insert_value_proof = merkelTree.path(i + 1).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
           // insert_root_proof = merkelTreeRoots.path(i + 1).pathElements.map((element:any) => toPaddedHex(BigInt(element)));
       }
       var averageGasUsed = averageGasUsed / tests;
       var testIndex = 10;
       var proof = merkelTree.path(testIndex);
       var input =  {
            subtree_root: values[testIndex].toString(),
            block_timestamp: timestamps[testIndex].toString(),
            root: merkelTree.root.toString(),
            path: proof.pathElements.map((element) => element.toString()),
            index_bits: proof.pathIndices.map((bit) => bit.toString())
        }
        // await topLevelMerkleTreeCircuit.init();
        // var result= await topLevelMerkleTreeCircuit.generateProof({input:input})
    

        //var verifyResult = await topLevelMerkleProof.verify(result.proof.proof, result.publicSignals.map((element) => toPaddedHex(BigInt(element))));
        //assert.equal(verifyResult, true);
       

    });
});