// //Tests that test hashing equilivance of actions.ts and the solidity contract using hardhat

// import { assert, expect } from "chai";
// import { ChainedProof, ProvingState } from "../src/lib/reveal_methods/base_functions/ChainedProof";
// import { ChainedProofWrapper } from "../src/lib/contract_wrappers/ChainedProofWrapper";
// import { ethers } from "hardhat";
// import { Signer } from "ethers";

// import { MerkleTree, PartialMerkleTree, ProofPath } from 'fixed-merkle-tree'
// import { mimcTestCircuit, topLevelMerkleTreeCircuit } from "@nihilium/zkp-circuits";
// import { DualMerkleTreeWrapper } from "../src/lib/contract_wrappers/DualMerkleTreeWrapper";

// import { uint8ArrayToHex } from "nihilium-circuits/utils/tools";
// import { createMimcMerkelTree, toPaddedHex, treeHasher } from "../src/lib/utils";
// var mimc7contract = require("../contracts/mimc7.json");
// const levels = 20;

// describe("ChainedProof", () => {
//     var chainedProof: ChainedProofWrapper;
//     var topLevelMerkleProof: any;
//     var topLevelMerkleProofAddress: string;
//     var verifierContract: any;
//     var verifierContractAddress: string;
//     var merkleTreeContract: any;
//     var merkleTreeContractAddress: string;
   
//     var signers: Signer[];
//     before("should deploy ChainedProof contract", async () => {
//         signers  = (await ethers.getSigners()) as unknown as Signer[];
//         const verifier =  new ethers.ContractFactory(mimc7contract.abi, mimc7contract.bytecode, signers[0]);
//         const topLevelMerkleProofC = await ethers.getContractFactory("top_level_merkle_proof");
//         topLevelMerkleProof = await topLevelMerkleProofC.deploy();
//         topLevelMerkleProofAddress = await topLevelMerkleProof.getAddress();
//         console.log(topLevelMerkleProofAddress);
        
//         verifierContract = await verifier.deploy();
//         verifierContractAddress = await verifierContract.getAddress();

//         const merkleTree = await ethers.getContractFactory("DualMerkleTree");
//         merkleTreeContract = await merkleTree.deploy(signers[0], levels, verifierContractAddress);
//         merkleTreeContractAddress = await merkleTreeContract.getAddress();
//         console.log(merkleTreeContractAddress);
        
        
//         //expect(chainedProof).to.be.an("object");
//     });
//     /**
//      * Here we test the creation of a merkle tree in the browser.
//      * Post this on chain.
//      * Create a merkle proof in the browser
//      * And verify the proof on chain
//      */
//     it("Test full circle mimc proofs", async () => {
//        var onChainTree = new DualMerkleTreeWrapper(signers[0]);
//        await onChainTree.attach(merkleTreeContractAddress);
//        var merkelTree:MerkleTree = await createMimcMerkelTree(levels, []);
//        var leafs: bigint[] = [];
//        var values: bigint[] = [];
//        var timestamps: number[] = [];
//        for (let i = 0; i < 64; i++) {
//             var {index, timestamp, newValueRoot, leafHash, newMerkleRoot} = await onChainTree.insert(toPaddedHex(BigInt(i + 1)), await signers[0].getAddress());
//             var leaf = treeHasher(BigInt(i + 1), timestamp);
//             merkelTree.insert(leaf);
//             assert.equal(BigInt(merkelTree.root), newValueRoot);
//             assert.equal(BigInt(leaf), leafHash);
//             leafs.push(leaf);
//             values.push(BigInt(i + 1));
//             timestamps.push(timestamp);
//        }
//        var testIndex = 10;
//        var proof = merkelTree.path(testIndex);
//        var input =  {
//             subtree_root: values[testIndex].toString(),
//             block_timestamp: timestamps[testIndex].toString(),
//             root: merkelTree.root.toString(),
//             path: proof.pathElements.map((element) => element.toString()),
//             index_bits: proof.pathIndices.map((bit) => bit.toString())
//         }
//         await topLevelMerkleTreeCircuit.init();
//         var result= await topLevelMerkleTreeCircuit.generateProof({input:input})
    

//         var verifyResult = await topLevelMerkleProof.verify(result.proof.proof, result.publicSignals.map((element) => toPaddedHex(BigInt(element))));
//         assert.equal(verifyResult, true);
       

//     });
// });