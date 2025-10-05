
import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { cryptoTools } from '@nihilium/zkp-circuits';

import { ExtPointType } from "@noble/curves/abstract/edwards";
chai.use(chaiAsPromised);
// import {
//     toStringArray,
//     stringifyBigInts,
//     toBigIntArray,
//     formatPrivKeyForBabyJub,
//     coordinatesToExtPointBigint,
//     coordinatesToExtPoint,
//     babyJub,
//     generateRandom248BitNumber,
// } from '@nihilium/zkp-circuits/cryptoTools';
import {Keypair} from "../src/types/index";
import {ClientSingleShareSealingProcess} from "../src/lib/client_single_share_sealing";
import {Processor} from "../src/lib/processor";
// import { assert } from "console";
import { IDataStream } from "../src/lib/data_stream/types";
//import { describe, it } from "mocha";
import { buildEddsa } from "circomlibjs";
//import { cryptoTools } from "@nihilium/zkp-circuits";
//import { EVMDataStream } from "../src/lib/data_stream/EVMDataStream";
import { EVMDataStreamNonZK } from "../src/lib/data_stream/EVMDataStreamNonZK";
import { ClientSingleShareUnsealingProcess } from "../src/lib/client_single_share_unsealing";
import { ProcessorEndpoint } from "../src/types/protocol/common";
import { DataStreamClient } from "../src/lib/data_stream/DataStreamClient";
import { ethers } from "hardhat";
import { Provider, Signer } from "ethers";
import { IDataStreamPersistence } from "../src/lib/persistence/types";
import { DataStreamFilePersistence } from "../src/lib/persistence/DataStreamFilePersistence";
import * as zkeddsa from "@zk-kit/eddsa-poseidon";
import { ChainedProofCollection } from "../src/lib/reveal_methods/collections/types";
import { RevealOnlyCollectionNormalTrees } from "../src/lib/reveal_methods/collections/reveal_only_normal_trees";
//import { validatedSigHeAddCircuit, encryptProofCircuit } from "@nihilium/zkp-circuits";
import { createKeccakMerkelTree, keccakTreeHasher, toPaddedHex } from "../src/lib/utils";
//var mimc7contract = require("../contracts/mimc7.json");
describe("Processor-Client intereaction", () => {
  context("rocessor-Client intereaction context", () => {
    let processor:Processor;
    let data_stream:IDataStream;
    //let eddsa: any;
    let signers: Signer[];
    let processor_endpoint:ProcessorEndpoint;
    let client_1:ClientSingleShareSealingProcess;
    let valueP:bigint = cryptoTools.generateRandom248BitNumber(); //1329227995784915872903807060280344575n; // 120-bit max
    let valueMetadata:bigint = cryptoTools.generateRandom248BitNumber(); //1329227995784915872903807060280344575n; // 120-bit max
    let valueQ:bigint = 1329226995684915862903806060280344565n; // 120-bit max
    let valueAdd: bigint = 1339226995683915862903806060280343565n
    
    let chainedProofCollection: ChainedProofCollection;

    let chainedProofContract: any;
    let chainedProofAddress: string;

    let openingProof: any;
    let openingProofAddress: string;

    let topLevelMerkleProof: any;
    let topLevelMerkleProofAddress: string;
    let mimcVerifierContract: any;
    let mimcVerifierContractAddress: string;
    let merkleTreeContract: any;
    let merkleTreeContractAddress: string;
    let encryptProofContract: any;
    let encryptProofAddress: string;
    let subTreeMerkleProof: any;
    let subTreeMerkleProofAddress: string;

    let genericAdjacentTreeProof: any;
    let genericAdjacentTreeProofAddress: string;

    let levels = 20;
    let persistence: IDataStreamPersistence;
    before(async () => {
      //eddsa = await buildEddsa();

      signers  = (await ethers.getSigners()) as unknown as Signer[];

      //Noir version
      // const openingProofC = await ethers.getContractFactory("validated_sig_he_add");
      // openingProof = await openingProofC.deploy();
      // openingProofAddress = await openingProof.getAddress();
      // console.log(openingProofAddress);

      //circom version
      const openingProofC = await ethers.getContractFactory("opening_proof");
      openingProof = await openingProofC.deploy();
      openingProofAddress = await openingProof.getAddress();
      console.log(openingProofAddress);

    
      const encryptProofC = await ethers.getContractFactory("encrypt_proof");
      encryptProofContract = await encryptProofC.deploy();
      encryptProofAddress = await encryptProofContract.getAddress();
      console.log(encryptProofAddress);

      const genericAdjacentTreeProofC = await ethers.getContractFactory("generic_adjacent_tree_proof");
      genericAdjacentTreeProof = await genericAdjacentTreeProofC.deploy();
      genericAdjacentTreeProofAddress = await genericAdjacentTreeProof.getAddress();
      console.log(genericAdjacentTreeProofAddress);

      // const topLevelMerkleProofC = await ethers.getContractFactory("top_level_merkle_proof");
      // topLevelMerkleProof = await topLevelMerkleProofC.deploy();
      // topLevelMerkleProofAddress = await topLevelMerkleProof.getAddress();
      // console.log(topLevelMerkleProofAddress);

      const topLevelMerkleProofC = await ethers.getContractFactory("TopLevelMerkleProof");
      topLevelMerkleProof = await topLevelMerkleProofC.deploy();
      topLevelMerkleProofAddress = await topLevelMerkleProof.getAddress();
      console.log(topLevelMerkleProofAddress);

      // const subTreeMerkleProofC = await ethers.getContractFactory("sub_tree_merkle_proof");
      // subTreeMerkleProof = await subTreeMerkleProofC.deploy();
      // subTreeMerkleProofAddress = await subTreeMerkleProof.getAddress();
      // console.log(subTreeMerkleProofAddress);

      const subTreeMerkleProofC = await ethers.getContractFactory("SubTreeMerkleProof");
      subTreeMerkleProof = await subTreeMerkleProofC.deploy();
      subTreeMerkleProofAddress = await subTreeMerkleProof.getAddress();
      console.log(subTreeMerkleProofAddress);

      // const mimcverifier =  new ethers.ContractFactory(mimc7contract.abi, mimc7contract.bytecode, signers[0]);
      // mimcVerifierContract = await mimcverifier.deploy();
      // mimcVerifierContractAddress = await mimcVerifierContract.getAddress();

      // const merkleTree = await ethers.getContractFactory("DualMerkleTree");
      // merkleTreeContract = await merkleTree.deploy(signers[0], levels, mimcVerifierContractAddress);
      // merkleTreeContractAddress = await merkleTreeContract.getAddress();

      const merkleTree = await ethers.getContractFactory("EmpheralMerkleTreeKeccak");
      merkleTreeContract = await merkleTree.deploy(signers[0], levels);
      merkleTreeContractAddress = await merkleTreeContract.getAddress();

      const chainedProofC = await ethers.getContractFactory("ChainedProof");
      chainedProofContract = await chainedProofC.deploy(openingProofAddress, openingProofAddress);
      chainedProofAddress = await chainedProofContract.getAddress();
      console.log(chainedProofAddress);


      console.log(merkleTreeContractAddress);
      const random = Date.now().toString();
      persistence = new DataStreamFilePersistence("./test_data/" + random, createKeccakMerkelTree);
      //data_stream = new EVMDataStream("test", persistence, merkleTreeContractAddress, signers[0], 10, 20, 10);
      data_stream = new EVMDataStreamNonZK("test", persistence, merkleTreeContractAddress, signers[0], 10, 20, 10);
      //data_stream = new DataStreamClient("http://localhost:3000");
      await data_stream.initialize();
      
      var he_encryption:cryptoTools.Keypair = cryptoTools.genKeypair()
      var signing_key:cryptoTools.Keypair = cryptoTools.genKeypair()
     // var bugger = cryptoTools.bigInt2Buffer(signing_key.privKey)
      var addsPubKey = zkeddsa.derivePublicKey(cryptoTools.bigInt2Buffer(signing_key.privKey))
      // var bigint_addsPubKey = [cryptoTools.bufferToBigInt(addsPubKey[0]), cryptoTools.bufferToBigInt(addsPubKey[1])]
      // var aaa = toBigIntArray(signing_key.pubKey)
      // var bbb = cryptoTools.toBigIntArray(cryptoTools.prv2pub(cryptoTools.bigInt2Buffer(signing_key.privKey)))
      // var ccc = cryptoTools.privateScalarToPubKey(signing_key.privKey)
      processor = new Processor(
        signing_key.privKey.toString(), 
        he_encryption.privKey.toString(),        
        chainedProofAddress,
        openingProofAddress,        
        signers[0]
      );

      processor_endpoint = {
        url: "https://localhost:3000",
        is_tor: false,
        public_verification_key: [addsPubKey[0], addsPubKey[1]],
        public_he_encryption_key: cryptoTools.toBigIntArray(he_encryption.pubKey),
        server_address: "0x0000000000000000000000000000000000000000"
      }
      // chainedProofCollection = new RevealOnlyCollection(openingProofAddress, 
      //   topLevelMerkleProofAddress, subTreeMerkleProofAddress, [data_stream], signers[0]);
      chainedProofCollection = new RevealOnlyCollectionNormalTrees(openingProofAddress, 
          topLevelMerkleProofAddress, subTreeMerkleProofAddress, [data_stream], signers[0] as unknown as Provider);
          
      client_1 = new ClientSingleShareSealingProcess(processor_endpoint, chainedProofCollection);
      await client_1.initialize(valueP, valueMetadata);

      await processor.initialize();
      console.log("encrypt_proof initialized");
        
  })

  /*
  Here we test the full circle of the protocol
  - Client creates a commit request
  - Processor creates a seal
  - Client publishes reveal value
  - Client unseals the seal
  - Processor validates the unsealing and returns the unsealed value
  - Client checks if the unsealed value is correct
  - Client checks if the unsealed value is provable
  - Client checks if the unsealed value is provable in the data stream
  - Client checks if the unsealed value is provable in the data stream
  */
  it("Verify Encrypt & Validate Signature circuit", async () => {

    
    const commitment_request = await client_1.request_commitment(false);
    const shamir_secret = client_1.get_shamir_secret();
    const response  = await processor.process_seal_request(commitment_request);
    const single_seal = await client_1.process_seal_response(response);
    //var ttt =await encryptProofContract.verify(response.proof.proof, response.public_signals)
    //console.log(response);
    //TODO continue here

    const unsealing_process = new ClientSingleShareUnsealingProcess(processor_endpoint, chainedProofCollection, single_seal);
    await unsealing_process.initialize();
    await data_stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);
    await data_stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);
    await unsealing_process.publish_reveal_value(data_stream.getAddress());
    var counter = 0;
    for(let i = 0; i < 0; i++) {
      await data_stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);
      counter++;
      console.log("Counter: " + counter);
    }
    console.log("Waiting for provable");
    while(true) {
      var provable = await unsealing_process.validate_elligble_for_unsealing();
      await new Promise(resolve => setTimeout(resolve, 50));
      counter++;
      if(counter % 50){
        console.log("Counter: " + counter);
      }
      if(provable) {
        break;
      }
      
    }
    const unseal_request = await unsealing_process.get_unseal_request();
    //await validatedSigHeAddCircuit.init()
    // var testtesta = await validatedSigHeAddCircuit.verifyProof(unseal_request.proof)
    // var testtest = await o.verify(unseal_request.proof.proof, unseal_request.proof.publicInputs);
    const unseal_response = await processor.process_unseal_request(unseal_request);
    
    
    const unsealed_value = await unsealing_process.process_unseal_response(unseal_response);
    
    expect(unsealed_value).to.equal(shamir_secret);
    // const unseal_response = await processor.process_unseal_request(unseal_request);
    // const unsealed_value = await unsealing_process.process_unseal_response(unseal_response);
    // expect(unsealed_value).to.equal(valueP);
  });


  });
});
