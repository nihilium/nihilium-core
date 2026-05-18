
import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { ExtPointType } from "@noble/curves/abstract/edwards";
chai.use(chaiAsPromised);

import {Keypair} from "../src/types/index";
import {ClientSingleShareSealingProcess} from "../src/lib/client/client_single_share_sealing";
import {Processor} from "../src/lib/processor/processor";
// import { assert } from "console";
import { IDataStream } from "../src/lib/data_stream/types";
import { describe, it } from "mocha";
import { buildEddsa } from "circomlibjs";
import { cryptoTools } from "@nihilium/zkp-circuits";

import { ClientSingleShareUnsealingProcess } from "../src/lib/client/client_single_share_unsealing";
import { ProcessorEndpoint } from "../src/types/protocol/common";
import { DataStreamClient } from "../src/lib/data_stream/DataStreamClient";

import { Signer, ethers } from "ethers";
import { IDataStreamPersistence } from "../src/lib/persistence/types";
import { DataStreamFilePersistence } from "../src/lib/persistence/DataStreamFilePersistence";
import * as zkeddsa from "@zk-kit/eddsa-poseidon";
import { ChainedProofCollection } from "../src/lib/reveal_methods/collections/types";
import { RevealOnlyCollection } from "../src/lib/reveal_methods/collections/reveal_only";
// import { validatedSigHeAddCircuit, encryptProofCircuit } from "nihilium-noir-circuits";
import axios from "axios";
import { RevealOnlyCollectionNormalTrees } from "../src/lib/reveal_methods/collections/reveal_only_normal_trees";
var mimc7contract = require("../contracts/mimc7.json");


/*
READ FIRST:
This test requires all contracts to be deployed. Use the deploy.ts script to deploy all contracts.
To run, first run datastream-server and processor-server.
Then run the test.

The test is focused on the client interaction with the network.
It touches the datastream and processor but is not part of the test suite.
To test those use full.test.ts
*/



describe("Processor-Client intereaction", () => {
  context("rocessor-Client intereaction context", () => {
    let processor:Processor;
    let data_stream:IDataStream;
    //let eddsa: any;
    //let signers: Signer[];
    let processor_endpoint:ProcessorEndpoint;
    let client_1:ClientSingleShareSealingProcess;
    let valueP:bigint = cryptoTools.generateRandom248BitNumber(); //1329227995784915872903807060280344575n; // 120-bit max
    
    let chainedProofCollection: ChainedProofCollection;

    let chainedProofAddress: string;

    
    let openingProofAddress: string;

    let topLevelMerkleProofAddress: string;
    let mimcVerifierContractAddress: string;
    let merkleTreeContractAddress: string;
    let encryptProofAddress: string;
    let subTreeMerkleProofAddress: string;

    let genericAdjacentTreeProofAddress: string;

    let levels = 20;
    let persistence: IDataStreamPersistence;
    before(async () => {
      //eddsa = await buildEddsa();
      const deployedContracts = require("../scripts/deployed-contracts-1337.json");
      // signers  = (await ethers.getSigners()) as unknown as Signer[];

      openingProofAddress = deployedContracts.validated_sig_he_add;
      console.log(openingProofAddress);

    
      encryptProofAddress = deployedContracts.encrypt_proof;
      console.log(encryptProofAddress);

      genericAdjacentTreeProofAddress = deployedContracts.generic_adjacent_tree_proof;
      console.log(genericAdjacentTreeProofAddress);

      topLevelMerkleProofAddress = deployedContracts.TopLevelMerkleProof;
      console.log(topLevelMerkleProofAddress);

      subTreeMerkleProofAddress = deployedContracts.SubTreeMerkleProof;
      console.log(subTreeMerkleProofAddress);

      mimcVerifierContractAddress = deployedContracts.MiMC7;
      console.log(mimcVerifierContractAddress);

      merkleTreeContractAddress = deployedContracts.DualMerkleTree;
      console.log(merkleTreeContractAddress);

      chainedProofAddress = deployedContracts.ChainedProof;
      console.log(chainedProofAddress);


      console.log(merkleTreeContractAddress);
      
      //data_stream = new EVMDataStream("test", persistence, merkleTreeContractAddress, signers[0], 10, 20, 10);
      data_stream = new DataStreamClient("http://localhost:3006");
      await data_stream.initialize();
      // var bugger = cryptoTools.bigInt2Buffer(signing_key.privKey)
      const response = await axios.get("http://localhost:3005/get_public_keys");
      const data = response.data;
      const addsPubKey = [data.signing_public_key[0], data.signing_public_key[1]];
      const he_encryption = [data.he_public_key[0], data.he_public_key[1]]
      const rpc_provider = new ethers.JsonRpcProvider("http://localhost:7545", 1337);

      processor_endpoint = {
        url: "http://localhost:3005",
        is_tor: false,
        public_verification_key: [BigInt(addsPubKey[0]), BigInt(addsPubKey[1])],
        public_he_encryption_key: [BigInt(he_encryption[0]), BigInt(he_encryption[1])],
        server_address: "0x0000000000000000000000000000000000000000"
      }
      chainedProofCollection = new RevealOnlyCollectionNormalTrees(openingProofAddress, 
        topLevelMerkleProofAddress, subTreeMerkleProofAddress, [data_stream], rpc_provider);
      client_1 = new ClientSingleShareSealingProcess(processor_endpoint, chainedProofCollection);
      await client_1.initialize(valueP, valueP);

        
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
    const single_seal = await client_1.request_commitment_to_processor();
    const shamir_secret = client_1.get_shamir_secret();
    

    const unsealing_process = new ClientSingleShareUnsealingProcess(processor_endpoint, chainedProofCollection, single_seal);
    await unsealing_process.initialize();
    await data_stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);
    await data_stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);
    await unsealing_process.publish_reveal_value(data_stream.getAddress());
    var counter = 0;
    for(let i = 0; i < 15; i++) {
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
    const unseal_response = await unsealing_process.unseal_request_to_processor();
    //await validatedSigHeAddCircuit.init()
    // var testtesta = await validatedSigHeAddCircuit.verifyProof(unseal_request.proof)
    // var testtest = await o.verify(unseal_request.proof.proof, unseal_request.proof.publicInputs);
    //const unseal_response = await processor.process_unseal_request(unseal_request);
    const unsealed_value = await unsealing_process.process_unseal_response(unseal_response);
    expect(unsealed_value).to.equal(shamir_secret);
    // const unseal_response = await processor.process_unseal_request(unseal_request);
    // const unsealed_value = await unsealing_process.process_unseal_response(unseal_response);
    // expect(unsealed_value).to.equal(valueP);
  });


  });
});
