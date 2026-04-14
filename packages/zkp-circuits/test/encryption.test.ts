
import * as fs from "fs";
import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

// import * as ec from '../src/ecelgamal'
import { babyJub, Keypair, PubKey } from "../src/utils/types";
import {decode, encode} from '../src/utils/decode'
import * as babyJubKit from "@zk-kit/baby-jubjub";
import * as zkeddsa from "@zk-kit/eddsa-poseidon";
import { buildBabyjub } from "circomlibjs"
import {pruneTo32Bits, BabyJubExtPoint,
    splitLargeNumber, combineChunksWithCarry, 
    generateRandom248BitNumber, privateScalarToPubKey, combineTwoPublicKeys,
    combineTwoPublicKeysPlain,
    bufferToBigInt, hashCypherText,  encryptECCBabyJub, decryptECCBabyJub, bigInt2Buffer,
    encrypt, decrypt, genPubKey, PrivKey
} from '../src/utils/tools'
import { FDTEncrypt, FDTDecrypt } from '../src/utils/dte'
import * as cryptoTools from '../src/utils/tools'
// import { buildPoseidon, buildBabyjub, buildEddsa } from "circomlibjs";
import { circomOpeningProof } from "../src";
// Load chai-as-promised support
chai.use(chaiAsPromised);

import { ExtPointType } from "@noble/curves/abstract/edwards";

import {
    toStringArray,
    stringifyBigInts,
    toBigIntArray,
    prv2pub,
    
    formatPrivKeyForBabyJub,
    coordinatesToExtPointBigint,
    coordinatesToExtPoint,
} from "../src/utils/tools";
import { poseidon1, poseidon2 } from "poseidon-lite";
// import { WrappedCircomCircuit } from "../dist/circom-wrapper";



type Mem = NodeJS.MemoryUsage;
type Sample = { t: number; rss: number; heapUsed: number; external: number; arrayBuffers: number };

export async function measureMemory<T>(fn: () => Promise<T>, opts = { sampleMs: 100 }) {
  // Optional: run Node with --expose-gc and uncomment to reduce noise
  // global.gc?.();

  const samples: Sample[] = [];
  const sample = () => {
    const m = process.memoryUsage();
    samples.push({
      t: performance.now(),
      rss: m.rss,
      heapUsed: m.heapUsed,
      external: m.external ?? 0,
      arrayBuffers: (m as any).arrayBuffers ?? 0,
    });
  };

  const before: Mem = process.memoryUsage();
  const start = performance.now();

  const timer = setInterval(sample, opts.sampleMs);
  try {
    const result = await fn();
    return { result };
  } finally {
    clearInterval(timer);
    const end = performance.now();
    const after: Mem = process.memoryUsage();

    const peak = samples.reduce(
      (p, s) => ({
        rss: Math.max(p.rss, s.rss),
        heapUsed: Math.max(p.heapUsed, s.heapUsed),
        external: Math.max(p.external, s.external),
        arrayBuffers: Math.max(p.arrayBuffers, s.arrayBuffers),
      }),
      { rss: before.rss, heapUsed: before.heapUsed, external: before.external ?? 0, arrayBuffers: (before as any).arrayBuffers ?? 0 }
    );

    // Optional: final GC then read again
    // global.gc?.();
    // const postGc = process.memoryUsage();

    (global as any).__lastMemReport = {
      durationMs: end - start,
      before,
      after,
      peak,
      delta: {
        rss: after.rss - before.rss,
        heapUsed: after.heapUsed - before.heapUsed,
        external: (after.external ?? 0) - (before.external ?? 0),
        arrayBuffers: ((after as any).arrayBuffers ?? 0) - ((before as any).arrayBuffers ?? 0),
      },
      samplesCount: samples.length,
    };
  }
}



type EncryptCircuitInputs = {
    inputP: string;
    inputQ: string,
    nonceKeys_p: string[];
    nonceKeys_q: string[];
    publicKey: string[];
};



/*

{
    inputP: string;
    inputQ: string,
    nonceKey_p: string;
    nonceKey_q: string;
    publicKey: string[];
}


**/



const genCircuitInputsHEAdd = (   
    pubKey: cryptoTools.PubKey,    
    value:bigint,
    points:cryptoTools.BabyJubExtPoint[],
    empheralKeys:cryptoTools.BabyJubExtPoint[],
    validationKey: any[],
    originalPublicKey: any[],
    signature:any,
    preimage:bigint,
    random_severed_commit: bigint,
    unseal_condition_root: bigint,
    metadata_root: bigint,
    babyJub?: any
) => {
    
    var noncesAdd = [cryptoTools.generateRandom248BitNumber(), cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(), cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber()]
    /*
    signal input input_add;
    //public key for encryption
    signal input publicKey[2];
    //nonce key for encryption
    signal input nonceKey_add[4];
    //TODO:signature validation & message_base validation
    //Original cihpertext from signature
    signal input point_org[8];    
    signal input ephemeralKey_org[8];


    **/
    let pubKeyXY = cryptoTools.toBigIntArray(pubKey)
    let heAddPubKey = {
        x: pubKeyXY[0].toString(),
        y: pubKeyXY[1].toString()
    }
    
    let input_encrypt: any = {
        input_add: value.toString(),
        nonceKey: noncesAdd.map(n => n.toString()),
        point_org: points.map(point => {    
            var c = cryptoTools.toBigIntArray(point)
            return {
                x: c[0].toString(),
                y: c[1].toString()
            }
        }),
        ephemeralKey_org: empheralKeys.map(key => {
            var c = cryptoTools.toBigIntArray(key)
            return {
                x: c[0].toString(),
                y: c[1].toString()
            }
        }),
        publicKey: heAddPubKey,
        severed_commit_preimage: preimage.toString(),
        severed_random_value: random_severed_commit.toString(),
        A:{x: validationKey[0].toString(), y: validationKey[1].toString()},
        R8x: signature.R8[0].toString(),
        R8y: signature.R8[1].toString(),
        S: signature.S.toString(),
        corresponding_public_key: {x: originalPublicKey[0].toString(), y: originalPublicKey[1].toString()},
        unseal_condition_root: unseal_condition_root.toString(),
        metadata_root: metadata_root.toString()
    };
    var input_circom: any = {}
    if(babyJub) {
        input_circom = {
            input_add: value.toString(),
            nonceKey_add: noncesAdd.map(n => n.toString()),
            point_org: points.map(n => toBigIntArray(n)).flat().map(n => n.toString()),
            ephemeralKey_org: empheralKeys.map(n => toBigIntArray(n)).flat().map(n => n.toString()),

            publicKey: [pubKeyXY[0].toString(), pubKeyXY[1].toString()],
            severed_commit_preimage: preimage.toString(),
            severed_random_value: random_severed_commit.toString(),
            // Ax: babyJub.F.toObject(validationKey[0]),
            // Ay: babyJub.F.toObject(validationKey[1]),
            // R8x: babyJub.F.toObject(signature.R8[0]),
            // R8y: babyJub.F.toObject(signature.R8[1]),
            Ax: validationKey[0].toString(),
            Ay: validationKey[1].toString(),
            R8x: signature.R8[0].toString(),
            R8y: signature.R8[1].toString(),
            S: signature.S,
            
            corresponding_public_key: [originalPublicKey[0].toString(), originalPublicKey[1].toString()],
            unseal_condition_root: unseal_condition_root.toString(),
            metadata_root: metadata_root.toString(),
            
        }
    }
    

    // const ephemeral_key = toStringArray(encryption.ephemeral_key);
    // const encrypted_message = toStringArray(encryption.encrypted_message);
    /*
{
        input_add: value,
        nonceKey_add: noncesAdd,
        point_org: points.map(point => toBigIntArray(point)).flat(),
        ephemeralKey_org: empheralKeys.map(key => toBigIntArray(key)).flat(),
        publicKey: toBigIntArray(pubKey),
        corresponding_public_key: originalPublicKey,
        severed_commit_preimage: preimage,
        severed_random_value: random_severed_commit,
        Ax: babyJub.F.toObject(validationKey[0]),
        Ay: babyJub.F.toObject(validationKey[1]),
        R8x: babyJub.F.toObject(signature.R8[0]),
        R8y: babyJub.F.toObject(signature.R8[1]),
        S: signature.S,
        unseal_condition_root: unseal_condition_root
    }

    */
    return { encoded: input_encrypt, plain: {}, input_circom };
};



const genCircuitInputsEncrypt = (
    keypair: Keypair,
    p:bigint
) => {
    
    var noncesP = [generateRandom248BitNumber(), generateRandom248BitNumber(),generateRandom248BitNumber(),generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(),generateRandom248BitNumber(),generateRandom248BitNumber()]
    // var noncesP = [ 38116541430840234661187596008457382924321103011611886794381710843913575121n,
    //     302830067343459087514725256916219934225188031637220355773687242195719691294n,
    //     28570927553584073505079004726143982630047880013063988915350931439771005032n,
    //     56913720794902961157810191490368391787541370683242061017049123684988463473n,
    //     450411783283458397354441519866350880674431186550408209143489703606758388945n,
    //     1473546918533661338975177602003612541684234592476520338853116954088365473n,
    //     151300525953355419938045395500699011592286907204661714727813722066363324993n,
    //     78515142496809377032217016876481668261831520240370423376550092090710709887n]
    
    
    // let ccc = zkeddsa.derivePublicKey(Buffer.from(keypair.privKey.toString(16), 'hex'))
    // var c2 = {
    //     x: ccc[0].toString(),
    //     y: ccc[1].toString(),
    // }
    var bigIntXY = toBigIntArray(keypair.pubKey)
    let input_encrypt = {
        privateKeyScalar: p.toString(),
        
        nonceKey_p: noncesP.map(nonce => nonce.toString()),
        publicKey: {
            x: bigIntXY[0].toString(),
            y: bigIntXY[1].toString(),
        }
    };

    // const ephemeral_key = toStringArray(encryption.ephemeral_key);
    // const encrypted_message = toStringArray(encryption.encrypted_message);
    return { encoded: input_encrypt, plain: {
        privateKeyScalar: p,
        
        nonceKey_p: noncesP,
        publicKey: toBigIntArray(keypair.pubKey),
    } };
};

describe("Testing ElGamal Scheme Circuits\n", () => {
    context("Testing Encrypt Circuit", () => {
        let input_encrypt: EncryptCircuitInputs;
        //let poseidon;
        let babyJubCircom;
        let circomCircuit = circomOpeningProof;
        let keypair: Keypair;
       
        //let privateKeyScalar:bigint = 175670895160431486954834726638948514027362457176185029971146384094749936134n; // 248-bit max
        let privateKeyScalar:bigint = generateRandom248BitNumber()
        privateKeyScalar = cryptoTools.shrinkToBits(privateKeyScalar, 247);
        //let valueQ:bigint = 1329226995684915862903806060280344565n; // 120-bit max
        //let valueAdd: bigint = generateRandom248BitNumber()
        //valueAdd = cryptoTools.shrinkToBits(valueAdd, 247);
        let ephemeral_key: string[];
        let encrypted_message: string[];
        
        before(async () => {
            //poseidon = await buildPoseidon();
            babyJubCircom = await buildBabyjub();
            //eddsa = await buildEddsa();
            // circomCircuit = new WrappedCircomCircuit({
            //     name: "opening",
            //     wasmPath: "circom-circuits/build/opening_proof/opening_proof_js/opening_proof.wasm",
            //     zkeyPath: "circom-circuits/build/opening_proof/opening_proof.zkey",
            //     vkeyPath: "circom-circuits/build/opening_proof/opening_proof_vkey.json",
            //     //signalsPath: "circom-circuits/build/opening_proof/opening_proof.json"
            // });
            var bbb:PrivKey = 17567089516043148695483472663894851402736245717618502997114638409474993613427n
            keypair =  { privKey:bbb, pubKey: genPubKey(bbb)} 
            // circomkit = new Circomkit({
            //     protocol: "groth16",//groth16 //plonk
            //   });
            await circomCircuit.init()
              
              // // artifacts output at `build/multiplier_3` directory
              // await circomkit.compile("add", {
              //   file: "add",
              //   template: "Add",
              //   params: [],
              // });
            
         
        });
        it("Test private key composition of two scalars", async () => {
            var scalarToAdd = generateRandom248BitNumber()
            //Calculate public key from private key scalar
            const privateKeyScalarPubKey = privateScalarToPubKey(privateKeyScalar);
            const scalarToAddPubKey = privateScalarToPubKey(scalarToAdd);

            //Test if the combined public key is the same as the private key scalar + scalar to add
            const combinedPubKey = combineTwoPublicKeys(privateKeyScalarPubKey, scalarToAddPubKey);
            const combinedPrivateKey = privateKeyScalar + scalarToAdd;
            const combinedPrivateKeyPubKey = privateScalarToPubKey(combinedPrivateKey);
            expect(combinedPubKey[0]).to.equal(combinedPrivateKeyPubKey[0])
            expect(combinedPubKey[1]).to.equal(combinedPrivateKeyPubKey[1])
            
        });


        // it("Test ECC Encryption & Decryption", async () => {
        //     var aesKey = generateRandom248BitNumber();
        //     var eccPubScal = privateScalarToPubKey(keypair.privKey)
        //     var eccPubKey = coordinatesToExtPointBigint(eccPubScal[0], eccPubScal[1])
        //     var encrypted = encryptECCBabyJub(aesKey, eccPubKey);
        //     var decrypted = decryptECCBabyJub(encrypted.ciphertextHex, encrypted.R, keypair.privKey);
        //     expect(decrypted).to.equal(aesKey);
        // });

        it("Test private key composition of two scalars- combinded", async () => {
            var scalarToAdd = generateRandom248BitNumber()
            //Calculate public key from private key scalar
            const privateKeyScalarPubKey = privateScalarToPubKey(privateKeyScalar);
            const scalarToAddPubKey = privateScalarToPubKey(scalarToAdd);

            //Test if the combined public key is the same as the private key scalar + scalar to add
            const combinedPubKey = combineTwoPublicKeys(privateKeyScalarPubKey, scalarToAddPubKey);
            const combinedPrivateKey = privateKeyScalar + scalarToAdd;
            const combinedPrivateKeyPubKey = privateScalarToPubKey(combinedPrivateKey);
            var aesKey = generateRandom248BitNumber();
            var encrypted = encryptECCBabyJub(aesKey, coordinatesToExtPointBigint(combinedPrivateKeyPubKey[0], combinedPrivateKeyPubKey[1]));
            var decrypted = decryptECCBabyJub(encrypted.ciphertextHex, encrypted.R, combinedPrivateKey);
            expect(decrypted).to.equal(aesKey);
            aesKey = 500n;
            var encrypted2 = encryptECCBabyJub(aesKey, coordinatesToExtPointBigint(combinedPrivateKeyPubKey[0], combinedPrivateKeyPubKey[1]));
            var decrypted2 = decryptECCBabyJub(encrypted2.ciphertextHex, encrypted2.R, combinedPrivateKey);
            expect(decrypted2).to.equal(aesKey);
            
        });



        it("Test Elgamal Encryption & Decryption", async () => {
            // var privateKey1 = privateKeyScalar;
            // var pubKey1 = keypair.pubKey;
            var valueToEncrypt = generateRandom248BitNumber();
            var splitValueToEncrypt = splitLargeNumber(valueToEncrypt);
            var encrypted = encrypt(keypair.pubKey, encode(babyJub.BASE, splitValueToEncrypt[0]), valueToEncrypt)
            var decrypted = decrypt(keypair.privKey, encrypted.ephemeral_key, encrypted.encrypted_message)
            var decoded = decode(babyJub.BASE, decrypted, 19)
            expect(decoded).to.equal(splitValueToEncrypt[0]);
        });

        it("Test full AON Encryption & Decryption", async () => {
            // Generate a long random text (~10kb), then encode it as bytes
           var totalKeys = 15
           var threshold = 5
           var privateKeys = Array.from({ length: totalKeys }, () => generateRandom248BitNumber());
           var pubKeys = privateKeys.map(privateKey => babyJub.BASE.multiply(privateKey));
           var message = generateRandom248BitNumber();
           var encrypted = FDTEncrypt(message, pubKeys, threshold);
           var totalCiphertexts = Object.keys(encrypted.cipherTexts).length;
           console.log("totalCiphertexts", totalCiphertexts);
           var encryptedJson = JSON.stringify(encrypted);
           var jsonSize = encryptedJson.length;
           var jsonSizeKB = jsonSize/1024;
           console.log("jsonSizeKB", jsonSizeKB);
           //Pick threshold random keys from the privateKeys, making sure not to pick the same key twice
           for (let i = 0; i < threshold; i++) {
               var selectedPrivateKeys = privateKeys.sort(() => Math.random() - 0.5).slice(0, threshold);
               var decrypted = FDTDecrypt(selectedPrivateKeys, encrypted.cipherTexts, encrypted.empheralKey);
               expect(decrypted).to.equal(message.toString());
           }
           
          
        });
        
        /**
         * Tests the full circuit interactions
         */
        // it("Verify Encrypt & Validate Signature circuit", async () => {

        //     var circuitInputs = genCircuitInputsEncrypt(keypair, privateKeyScalar);
        //     var splitPrivateKeyScalar = splitLargeNumber(privateKeyScalar)
            
        //     let metadata_root: bigint = generateRandom248BitNumber()
        //     metadata_root = cryptoTools.shrinkToBits(metadata_root, 247);
        //     var scalarToAdd = generateRandom248BitNumber()
        //     scalarToAdd = cryptoTools.shrinkToBits(scalarToAdd, 247);
        //     var commitment_preimage = generateRandom248BitNumber()
        //     var unseal_condition_root = generateRandom248BitNumber()
        //     var preimage_hash = poseidon1([commitment_preimage])
        //     var unseal_condition_root_hash = poseidon2([unseal_condition_root, preimage_hash])
        //     var splitScalarToAdd = splitLargeNumber(scalarToAdd + metadata_root)
        //     const summedArray = splitPrivateKeyScalar.map((value, index) => value + splitScalarToAdd[index]);
        //     //Calculate public key from private key scalar
        //     const privateKeyScalarPubKey = privateScalarToPubKey(privateKeyScalar);
        //     const scalarToAddPubKey = privateScalarToPubKey(scalarToAdd);
            
        //     //Test if the combined public key is the same as the private key scalar + scalar to add
        //     const combinedPubKey = combineTwoPublicKeys(privateKeyScalarPubKey, scalarToAddPubKey);
        //     const combinedPubKey2 = combineTwoPublicKeysPlain(privateKeyScalarPubKey, scalarToAddPubKey);
        //     const combinedPrivateKey = privateKeyScalar + scalarToAdd;
            
            
        //     const combinedPrivateKeyPubKey = privateScalarToPubKey(combinedPrivateKey);
        //     expect(combinedPubKey[0]).to.equal(combinedPrivateKeyPubKey[0])
        //     expect(combinedPubKey[1]).to.equal(combinedPrivateKeyPubKey[1])
            
        //     console.log(privateKeyScalar)
        //     console.log("splitP", splitPrivateKeyScalar,  combineChunksWithCarry(splitPrivateKeyScalar))
            
        //     // assert(combineChunksWithCarry(summedArray) == valueP+valueQ)
        //     var cipherTexts_p: { message: ExtPointType; ephemeral_key: ExtPointType; encrypted_message: ExtPointType; nonce: bigint; }[] = []
        //     const encrypted_point_coordinates: bigint[][] = [];
        //     var encrypted_ephemeral_key_coordinates: bigint[][] = [];
        //     splitPrivateKeyScalar.forEach((value, index) => {
        //         var encrypted = encrypt(keypair.pubKey, encode(babyJub.BASE, value), BigInt(circuitInputs.plain.nonceKey_p[index]))
        //         cipherTexts_p.push(encrypted)
        //         encrypted_point_coordinates.push(toBigIntArray(encrypted.encrypted_message))
        //         encrypted_ephemeral_key_coordinates.push(toBigIntArray(encrypted.ephemeral_key))
        //     })
           
        //     //Here we encrypt the value, this is the message create by the processor
         
          
        //     // Load the circuit
        //     //const circuit = await circomkit.readCircuits(circuitName);
        //     console.time('Proving Time');
        //     //for(let i = 0; i < 5; i++) {
        //     // Execute the circuit with the provided inputs
            
        //     await encryptProofCircuit.init()
        //     var circuit = await encryptProofCircuit.generateProof({input: circuitInputs.encoded})
            
        //     const ouputPubKeyX = circuit.publicSignals[0];
        //     const ouputPubKeyY = circuit.publicSignals[1];
            
        //     expect(BigInt(ouputPubKeyX)).to.equal(privateKeyScalarPubKey[0])
        //     expect(BigInt(ouputPubKeyY)).to.equal(privateKeyScalarPubKey[1])

        //     const point_p:BabyJubExtPoint[] = [];
        //     const point_coordinates: bigint[][] = [];
            
        //     for (let i = 0; i < 8; i++) {
                
        //         var x = BigInt(circuit.publicSignals[2 + i*2])
        //         var y = BigInt(circuit.publicSignals[2 + i*2 + 1])
        //         point_coordinates.push([x,y])
        //         point_p.push(coordinatesToExtPointBigint(x,y));
        //     }
        //     // var field = ""
        //     // for (let i = 0; i < 8; i++) {
        //     //     field = `main.point_p[${i*2}]`
        //     //     var x = (await circuit.readWitness(b, [field]))[field]
        //     //     field = `main.point_p[${(i*2)+1}]`
        //     //     var y:any = (await circuit.readWitness(b, [field]))[field]
        //     //     point_coordinates.push([x,y])
        //     //     point_p.push(coordinatesToExtPointBigint(x,y));
        //     // }

         

        //     const empheral_p: BabyJubExtPoint[] = [];
        //     const empheral_p_coordinates: bigint[][] = [];
            
        //     for (let i = 0; i < 8; i++) {
                
        //         var x = BigInt(circuit.publicSignals[18 + i*2])
        //         var y = BigInt(circuit.publicSignals[18 + i*2 + 1])
        //         empheral_p_coordinates.push([x,y])
        //         empheral_p.push(coordinatesToExtPointBigint(x,y));
        //     }
        //     // const empheral_p_coordinates: bigint[][] = [];
        //     // for (let i = 0; i < 8; i++) {
        //     //     field = `main.ephemeralKey_p[${i*2}]`
        //     //     var x = (await circuit.readWitness(b, [field]))[field]
        //     //     field = `main.ephemeralKey_p[${(i*2)+1}]`
        //     //     var y:any = (await circuit.readWitness(b, [field]))[field]
        //     //     empheral_p_coordinates.push([x,y])
        //     //     empheral_p.push(coordinatesToExtPointBigint(x,y));
        //     // }

          
        //     const prvKeyBuffer = Buffer.from(keypair.privKey.toString(16), 'hex');
        //     var random_severed_commit = generateRandom248BitNumber()
        //     const pubValidationKey = zkeddsa.derivePublicKey(prvKeyBuffer);
        //     //Different pubkey from homomorphic addition
        //     // const pubKeyArrayBigint = [bufferToBigInt(pubValidationKey[0]), bufferToBigInt(pubValidationKey[1])]
        //     // const pubKeyArray = toBigIntArray(keypair.pubKey);
        //     // const pubKeySelf = toBigIntArray(prv2pub(prvKeyBuffer))
        //     var hashed_metadata_root = poseidon2([metadata_root, commitment_preimage])
        //     var msg = hashCypherText(point_coordinates.flat(), 
        //         empheral_p_coordinates.flat(), privateKeyScalarPubKey, preimage_hash,                
        //         random_severed_commit,
        //         unseal_condition_root_hash,
        //         hashed_metadata_root
        //     )
        //     //Sign the message using EdDSA
        //     const signature = zkeddsa.signMessage(prvKeyBuffer, msg);
        //     const _pubKey = zkeddsa.derivePublicKey(prvKeyBuffer);
        //     const signature_verified = zkeddsa.verifySignature(msg, signature, _pubKey);
        //     expect(signature_verified).to.equal(true)
        //     //const pSignature = eddsa.packSignature(signature);


        //     var decrypted_p: bigint[] = []
        //     for (let i = 0; i < 8; i++) {
        //         decrypted_p.push(decode(babyJub.BASE, decrypt(keypair.privKey, empheral_p[i], point_p[i]), 19))
        //     }

        //     //Test that the decrypted values are the same as the original values
        //     for(let i = 0; i < 8; i++) {
        //         expect(decrypted_p[i]).to.equal(splitPrivateKeyScalar[i])
                
        //     }
        // //}
        //     console.timeEnd('Proving Time');

            


        //     //---------------------- do the homomorphic addition ----------------------

        //     /*

        //      var metadata_root_shrinked = cryptoTools.shrinkToBits(this.metadata_root, 247);
        // var input = genCircuitInputsHEAdd(hePubKey, valueToAdd,
        //     point_p,
        //     empheral_p,            
        //     [this.processor.public_verification_key[0], this.processor.public_verification_key[1]],
        //     [BigInt(processor_response.new_public_key[0]), BigInt(processor_response.new_public_key[1])],            
        //     sig,
        //     this.reveal_value_preimage,
                  
        //     BigInt(processor_response.severed_commitment_random_value),
        //     this.unseal_condition_root,
        //     metadata_root_shrinked
        // );
        //     */


        
        //     var circuitInputsHEAdd = genCircuitInputsHEAdd(keypair.pubKey, scalarToAdd, point_p, empheral_p, 
        //         pubValidationKey, privateKeyScalarPubKey, signature,
        //          commitment_preimage, random_severed_commit, unseal_condition_root, metadata_root, babyJubCircom)
        // console.time('Circom Time')
        //     var circomCircuitInputs:any = {publicSignals: []}
        //     await measureMemory(async () => {
        //         circomCircuitInputs = await circomCircuit.generateProof({input: circuitInputsHEAdd.input_circom})
        //     });
        //     var rawProof = cryptoTools.uint8ArrayToHex(circomCircuitInputs.proof)
        //     console.log("rawProof", rawProof)
            
        //     const mem = (globalThis as any).__lastMemReport;
            
            
        //     var circomSignals = circomCircuitInputs.publicSignals.map(signal => BigInt(signal))
        //     console.timeEnd('Circom Time')

        //     var circuitNameHeAdd = 'validate-sig';
        
        //     await validatedSigHeAddCircuit.init()
        //     console.time('Noir Time')
        //     var bAdd = await validatedSigHeAddCircuit.generateProof({input: circuitInputsHEAdd.encoded})
        //     console.timeEnd('Noir Time')
        //     var signals_bigint = bAdd.publicSignals.map(signal => BigInt(signal))

        //     for(let i = 0; i < circomSignals.length; i++) {
        //         expect(circomSignals[i]).to.equal(signals_bigint[i])
        //     }
        //     var newCombinedPublicKey = BigInt(bAdd.publicSignals[39])
        //     expect(newCombinedPublicKey).to.equal(combinedPrivateKeyPubKey[0])
        //     var newCombinedPublicKeyY = BigInt(bAdd.publicSignals[40])
        //     expect(newCombinedPublicKeyY).to.equal(combinedPrivateKeyPubKey[1])
        //     const point_he: BabyJubExtPoint[] = [];
        //     for (let i = 0; i < 8; i++) {
        //         var x = BigInt(bAdd.publicSignals[3 + i*2])
        //         var y = BigInt(bAdd.publicSignals[3 + i*2 + 1])
               
        //         point_he.push(coordinatesToExtPointBigint(x,y));
        //     }

        //     const empheral_he: BabyJubExtPoint[] = [];
        //     for (let i = 0; i < 8; i++) {
        //         var x = BigInt(bAdd.publicSignals[19 + i*2])
        //         var y = BigInt(bAdd.publicSignals[19 + i*2 + 1])
               
        //         empheral_he.push(coordinatesToExtPointBigint(x,y));
        //     }
        //     console.time('Decrypt Time');
        //     const decrypted_he: bigint[] = [];
        //     for (let i = 0; i < 8; i++) {
        //         const decryptedValue = decode(
        //             babyJub.BASE,
        //             decrypt(keypair.privKey, empheral_he[i], point_he[i]),
        //             19
        //         );
        //         decrypted_he.push(decryptedValue);
        //     }
        //     console.timeEnd('Decrypt Time');
        //     // Test that the decrypted homomorphic addition values are correct
        //     for (let i = 0; i < 8; i++) {
        //         expect(decrypted_he[i]).to.equal(splitScalarToAdd[i] + splitPrivateKeyScalar[i]);
        //     }

        //     var combined_encrypted_message = combineChunksWithCarry(decrypted_he)
        //     var combined_encrypted_message_minus_metadata_root = combined_encrypted_message - metadata_root
        //     var combinedKey = privateKeyScalar + scalarToAdd
            
        //     expect(combined_encrypted_message_minus_metadata_root).to.equal(combinedKey)



        //     //const witness = await circomkit.prove(circuitName, 'input_test', circuitInputsEncoded);
            
        //     // Optionally, you can check constraints and print the witness
        //     //await circuit.checkConstraints(witness);
           
        //     //console.log('Witness:', witness);
            

        //     // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        //     //     input_encrypt,
        //     //     wasm_path_encrypt,
        //     //     zkey_path_encrypt,
        //     // );
        //     // const vKey = JSON.parse(
        //     //     fs.readFileSync("./circuits/artifacts/encrypt_test/encrypt.vkey.json"),
        //     // );

        //     // const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        //     // expect(res).to.equal(true);
        // });

       
    });

});
