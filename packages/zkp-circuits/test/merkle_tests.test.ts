// import fs from "fs";
// import { expect } from "chai";
// import chai from "chai";
// import chaiAsPromised from "chai-as-promised";
// import { buildPoseidon, buildPedersenHash, buildMimc7 } from "circomlibjs";
// //import { pedersen_hash } from "circomlibjs";

// import { babyJub, bigInt2Buffer, buffer2HexString, bufferToBigInt, generateRandom248BitNumber, hexString2Buffer, stringifyBigInts, toBigIntArray, uint8ArrayToHex, stringToCurve } from "../src/utils/tools";
// import { WrappedNoirCircuit} from "../src/circuit-wrapper";
// import { MerkleTree } from "fixed-merkle-tree";
// import { InputMap } from "@noir-lang/noir_js";
// import { top_level_merkle_proofInputType} from "../src/tscircuits/top_level_merkle_proof/index";
// import { mimc_testInputType} from "../src/tscircuits/mimc_test/index";
// const ZERO = 7507787612525723758659662260399184323980001748885802124580171315331567144978n
// const circuitJson = "./src/tscircuits/top_level_merkle_proof/top_level_merkle_proof.json";
// const mimcCircuitJson = "./src/tscircuits/mimc_test/mimc_test.json";
// // Load chai-as-promised support
// chai.use(chaiAsPromised);

// type SeveredCommitmentInputs = {
//     Ax: bigint;
//     Ay: bigint;
//     S: bigint;
//     R8x: bigint;
//     R8y: bigint;
//     random_value: bigint;
//     pre_image: bigint;
// };



// describe("Testing Severed Commitment Circuit\n", () => {
//     context("Testing Severed Commitment Circuit", () => {
//         let hashFunction: (left: any, right: any) => string;
//         let merkleTree: MerkleTree;
//         let wrappedCircuit: WrappedNoirCircuit<top_level_merkle_proofInputType>;
//         let poseidon: any;
//         let pederson: any;
//         let mimc: any;
//         before(async () => {
//             wrappedCircuit = new WrappedNoirCircuit<top_level_merkle_proofInputType>(circuitJson);
//             await wrappedCircuit.init();
//             poseidon = await buildPoseidon()
//             pederson = await buildPedersenHash()
//             mimc = await buildMimc7()
//             hashFunction = (left, right) => {
//                 var pos = mimc.hash(BigInt(left), BigInt(right))
//                 var curvePoint = mimc.F.toString(pos)
//                 var toReturn = uint8ArrayToHex(pos)
//                 return curvePoint;
//             }
        
         
//         });

//         it("Verify Poseidon circuit", async () => {
//             const pre_image = generateRandom248BitNumber();
//             const random_value = generateRandom248BitNumber();
//             var input = {
//                 p1: pre_image.toString(),
//                 p2: random_value.toString()
//             }
//             var wrappedCircuit = new WrappedNoirCircuit<mimc_testInputType>(mimcCircuitJson);
//             await wrappedCircuit.init();
//             var localPoseidon = mimc.hash(pre_image, random_value)
//             var t = uint8ArrayToHex(localPoseidon)
//             var t3 = hexString2Buffer(t)
//             var curvePoint = mimc.F.toObject(localPoseidon)

//             var result = await wrappedCircuit.generateProof({input: input});
//             var resultInt = BigInt(result.publicSignals)
//             expect(resultInt).to.equal(curvePoint);
//             var inputBigint = BigInt("0x"+uint8ArrayToHex(localPoseidon))
//             input.p1 = curvePoint.toString()
//             input.p2 = input.p1

//             var localPoseidon2 = mimc.hash(curvePoint, curvePoint)
//             var t2 = uint8ArrayToHex(localPoseidon2)
//             var t22 = hexString2Buffer(t2)
//             var curvePoint2 = mimc.F.toObject(localPoseidon2)
            
            
//             result = await wrappedCircuit.generateProof({input: input});
//             resultInt = BigInt(result.publicSignals)
//             console.log(result);
//             expect(resultInt).to.equal(curvePoint2);
            
//         });
      
//         it("Verify Severed Commitment circuit", async () => {
//             // Generate test inputs
//             const pre_image = generateRandom248BitNumber();
//             const random_value = generateRandom248BitNumber();
//             var knownLeaf = hashFunction(pre_image, random_value)
//             var merkle_tree = new MerkleTree(20, [], {hashFunction: hashFunction, zeroElement: ZERO as any});
            
//             for (let i = 0; i < 20; i++) {
//                 var leaf = hashFunction(generateRandom248BitNumber(), generateRandom248BitNumber())
//                 merkle_tree.insert(leaf);
//             }
//             merkle_tree.insert(knownLeaf);
//             //merkle_tree.insert(leaf);
//             const root = merkle_tree.root;
//             const proof = merkle_tree.path(20);
//             console.log(proof);

//             /**
//              * 
// export type top_level_merkle_proofInputType = {
//   subtree_root: Field;
//   block_timestamp: Field;
//   root: Field;
//   path: Field[];
//   index_bits: boolean[];
// }
//              */
//             var aaa = stringToCurve(mimc, root.toString())
            
//             var input =  {
//                 subtree_root: pre_image.toString(),
//                 block_timestamp: random_value.toString(),
//                 root: root.toString(),
//                 path: proof.pathElements.map((element) => element.toString()),
//                 index_bits: proof.pathIndices.map((bit) => bit.toString())
//             }
//             var result= await wrappedCircuit.generateProof({input:input})
//             var verifyResult = await wrappedCircuit.verifyProof(result.proof);
//             expect(verifyResult).to.equal(true);
//             console.log(result);
            
           
//         });


//         // it("Verify Severed Commitment circuit FULL", async () => {
//         //     // Generate test inputs
//         //     const pre_image = 123456789n;
//         //     const random_value = 987654321n;

            

//         //     // Create message to sign
//         //     const pre_image_hash = poseidon([pre_image]);
//         //     const combined_hash = poseidon([pre_image_hash, random_value]);

//         //     // Sign the message
//         //     signature = eddsa.signPoseidon(prvKey, combined_hash);

//         //     // Prepare circuit inputs
//         //     const circuitInputs = {
//         //         Ax: babyJub.F.toObject(pubKey[0]),
//         //         Ay: babyJub.F.toObject(pubKey[1]),
//         //         S: signature.S,
//         //         R8x: babyJub.F.toObject(signature.R8[0]),
//         //         R8y: babyJub.F.toObject(signature.R8[1]),
//         //         random_value: random_value,
//         //         pre_image: pre_image
//         //     };

//         //     // Load and test the circuit
//         //     const circuit = wrappedcircuit
//         //     // const signals = await extractCircuitSignals("./circuits/severed_commitment.circom")
//         //     const witness = await circuit.generateProof({input: circuitInputs});

//         //     // Verify the reveal_value output
//         //     const reveal_value = witness.parsedSignals.outputs.reveal_value;
//         //     const Ax_out = witness.parsedSignals.outputs.Ax_out;
//         //     const Ay_out = witness.parsedSignals.outputs.Ay_out;
            
//         //     // Calculate expected reveal_value
//         //     const expected_reveal_value = poseidon([pre_image, random_value]);

//         //     // Verify the reveal_value matches our expectation
//         //     expect(reveal_value).to.equal(babyJub.F.toObject(expected_reveal_value));
//         //     expect(Ax_out).to.equal(babyJub.F.toObject(pubKey[0]));
//         //     expect(Ay_out).to.equal(babyJub.F.toObject(pubKey[1]));

           
//         // });
//     });
// }); 