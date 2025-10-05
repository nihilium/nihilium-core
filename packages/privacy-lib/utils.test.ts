// import {
//   bigIntToString,
//   stringToBigInt,
//   bigIntToJSON,
//   JSONToBigInt,
//   formatCircuitInput,
//   parseCircuitOutput
// } from '../src/utils';
// import { expect } from "chai";
// import chai from "chai";
// import chaiAsPromised from "chai-as-promised";
// import * as ec from "../src/ecelgamal";
// import { ExtPointType } from "@noble/curves/abstract/edwards";
// chai.use(chaiAsPromised);
// import {
//     toStringArray,
//     stringifyBigInts,
//     toBigIntArray,
//     formatPrivKeyForBabyJub,
//     coordinatesToExtPointBigint,
//     coordinatesToExtPoint,
//     babyJub,
// } from "../src/tools";
// import {Keypair} from "../src/types/index";

// import {ProcessorStageOne} from "../src/lib/processor";
// // import { assert } from "console";
// import { describe, it } from "mocha";


// describe("Testing ElGamal Scheme Circuits\n", () => {
//   context("Testing Encrypt Circuit", () => {
//     let encrypt_proof:ProcessorStageOne;
    
//     let valueP:bigint = 1329227995784915872903807060280344575n; // 120-bit max
//     let valueQ:bigint = 1329226995684915862903806060280344565n; // 120-bit max
//     let valueAdd: bigint = 1339226995683915862903806060280343565n
//     before(async () => {
      
      
//       var bbb:ec.PrivKey = 17567089516043148695483472663894851402736245717618502997114638409474993613427n
//       var pubKey = ec.genPubKey(bbb)
//       encrypt_proof = new ProcessorStageOne(
//         bbb.toString(16), 
//         toStringArray(pubKey));
     

//       await encrypt_proof.initialize();
//       console.log("encrypt_proof initialized");
        
//   })

//   it("Verify Encrypt & Validate Signature circuit", async () => {

//     let encrypted_message = await encrypt_proof.generateProof(valueP, valueQ);

//     console.log(encrypted_message);
//   });


//   });
// });
