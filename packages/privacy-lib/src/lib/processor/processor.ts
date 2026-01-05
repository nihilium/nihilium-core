import { cryptoTools } from '@nihilium/zkp-circuits';
import { DlogSolver } from '@nihilium/dlog-solver-rs';
// import { babyJub, Keypair, PubKey } from "../types/index";
// import { bigInt2Buffer, bufferToBigInt, coordinatesToExtPointBigint, generateRandom248BitNumber, stringifyBigInts, toBigIntArray, uint8ArrayToHex } from '@nihilium/noir-circuits/utils/tools';
// import { Environment } from 'nihilium-circuits/types/circuit_wrapper';
import { SingleSealRequest, SingleSealRequestResponse, SingleUnsealRequest, SingleSealUnsealRequestResponse } from '../../types/protocol/common';
//import { buildBabyjub, buildEddsa, buildPoseidon } from 'circomlibjs';
//import { circuit_ENCRYPT_PROOF, circuit_KEY_HE_ADD } from '../env_settings';
import { hexToBytes } from '@noble/hashes/utils';

import { encrypt_proofInputType, encryptProofCircuit } from '@nihilium/zkp-circuits';
import { GenericVerifyCollection } from '../unseal_conditions/generic_verify_collection';
import { Signer } from 'ethers';

import path from 'path';
import { toPaddedHex } from '../utils';
// import { stringifyBigInts, toBigIntArray, generateRandom248BitNumber, coordinatesToExtPoint } from 'nihilium-circuits'
/**
 * ProcessorStageOne
 * 
 * Handles the first stage of processing using the encrypt_proof circuit
 */
type EncryptCircuitInputs = {
    inputP: string;
    inputQ: string,
    nonceKeys_p: string[];
    nonceKeys_q: string[];
    publicKey: string[];
};

const genCircuitInputsEncrypt = (
  pubKey: cryptoTools.BabyJubExtPoint,
  p:bigint
) => {
  
  var noncesP = [cryptoTools.generateRandom248BitNumber(), cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(), cryptoTools.generateRandom248BitNumber(), cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber(),cryptoTools.generateRandom248BitNumber()]
  // var noncesP = [ 38116541430840234661187596008457382924321103011611886794381710843913575121n,
  //     302830067343459087514725256916219934225188031637220355773687242195719691294n,
  //     28570927553584073505079004726143982630047880013063988915350931439771005032n,
  //     56913720794902961157810191490368391787541370683242061017049123684988463473n,
  //     450411783283458397354441519866350880674431186550408209143489703606758388945n,
  //     1473546918533661338975177602003612541684234592476520338853116954088365473n,
  //     151300525953355419938045395500699011592286907204661714727813722066363324993n,
  //     78515142496809377032217016876481668261831520240370423376550092090710709887n]
  
  
  
  var bigIntXY = cryptoTools.toBigIntArray(pubKey)
  let input_encrypt: encrypt_proofInputType = {
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
      publicKey: cryptoTools.toBigIntArray(pubKey),
  } };
};


export class Processor {
  // private encrypt_proof_circuit: WrappedCircuit | null = null;
  // private key_he_add_circuit: WrappedCircuit | null = null;
  private signingPrivateKey: bigint;
  //private babyJub: any;
  private publicHEKey: cryptoTools.PubKey;
  private signing_PublicKey!: [bigint, bigint];
  private zkeddsa: any;
  //private eddsa: any;
  //private poseidon: any;
  private privateHEKey: bigint;
  private chained_proof_address: string;
  private forced_opening_address: string;
  private signer: Signer;
  //private managed_data_stream: IDataStream;
  private dlogSolver: DlogSolver;
  /**
   * Create a new ProcessorStageOne instance
   * 
   * @param privateKeyP First private key in hex format
   * @param privateKeyQ Second private key in hex format
   */
  constructor(signingPrivateKey: string, 
    privateHEKey:string,     
    chained_proof_address: string, 
    forced_opening_address: string,
    // managed_data_stream: IDataStream,
    signer: Signer
  ) {
    this.signingPrivateKey = BigInt(signingPrivateKey) // zkeddsa.deriveSecretScalar(Buffer.from(signingPrivateKey, 'hex'));
    this.privateHEKey = BigInt(privateHEKey);
    this.publicHEKey = cryptoTools.genPubKey(this.privateHEKey);
    
    this.chained_proof_address = chained_proof_address;
    this.forced_opening_address = forced_opening_address;
    this.signer = signer;
    this.dlogSolver = new DlogSolver(19, path.join(__dirname, '../../lookupTables/x19xlookupTable.json'));
  }
  
  get_chain_id(): number {
    return Number(this.signer.provider!.getNetwork().then(network => network.chainId));
  }

  get_chained_proof_address(): string {
    return this.chained_proof_address;
  }

  get_forced_opening_address(): string {
    return this.forced_opening_address;
  }
  /**
   * Initialize the circuit
   */
  async initialize(): Promise<void> {
    this.zkeddsa = await import("@zk-kit/eddsa-poseidon");
    this.signing_PublicKey = this.zkeddsa.derivePublicKey(Buffer.from(BigInt(this.signingPrivateKey).toString(16), 'hex'))
    await encryptProofCircuit.init()
    //await validatedSigHeAddCircuit.init()
  
  }

  async get_public_keys(): Promise<{signing_public_key: [string, string], he_public_key: [string, string]}> {
    return {
      signing_public_key: this.signing_PublicKey.map(key => key.toString()) as [string, string],
      he_public_key: cryptoTools.toBigIntArray(this.publicHEKey).map(key => key.toString()) as [string, string]
    };
  }


  //TODO: should also be in an SGX/TEE environment
  async process_unseal_request(request: SingleUnsealRequest): Promise<SingleSealUnsealRequestResponse> {
    console.time("ChainedProofVerification")
    var verification_collection = new GenericVerifyCollection([],
       this.chained_proof_address, 
       this.forced_opening_address,
       request.unseal_proof_actions,
       this.signer.provider!,
       this.signer)
    await verification_collection.initialize();
    //TODO actually verify the merkle proof
    var path = request.unseal_root_proof.pathRoot;
    //TODO This is a temp fix, we should consider how we handle keccack hashes as inputs in circuits
    var correctedPathRoot = toPaddedHex(BigInt(path) % cryptoTools.SNARK_FIELD_SIZE); //babyjub modulus
    var unseal_condition_root = request.public_signals[0][1];
    var toCheck = await verification_collection.getUnsealRoot(true, request.proofs.map(proof => hexToBytes(proof.slice(2))), request.public_signals)
    var proofs = await verification_collection.verifySolidity(false, 
      request.data_stream_address, request.proofs.map(proof => hexToBytes(proof.slice(2))), request.public_signals)
    
    var proofsCorrect = toCheck === proofs
    var rootCorrect = correctedPathRoot === unseal_condition_root
    if(!proofsCorrect) {
      throw new Error(`Invalid chained proof: expected ${request.unseal_root_proof.pathElements[0]} ${toCheck} but got ${proofs}`)
    }
    if(!rootCorrect) {
      throw new Error(`Invalid unseal condition root: expected ${request.public_signals[0][1]} but got ${unseal_condition_root} - ${correctedPathRoot}`)
    }
    console.timeEnd("ChainedProofVerification")
    //TODO only pass after proofs are correct
    var cyphertexts = request.public_signals[0].slice(3, 19).map(signal => BigInt(signal));
    var ephemeral_keys = request.public_signals[0].slice(19, 35).map(signal => BigInt(signal));
    var public_key = request.public_signals[0].slice(35, 37).map(signal => BigInt(signal));
    //Check if the public key from the signals is the same as the one represented by the private key of this
    //Processor. This way it is we can validate the original component was generated by this processor
    if(public_key[0] !== this.signing_PublicKey[0] || public_key[1] !== this.signing_PublicKey[1]) {
      throw new Error("Invalid public key")
    }
    //We don't verify the proof as it is already verified by the chained proof
    // console.time("verifyProof")
    // var valid = await validatedSigHeAddCircuit.verifyProof({proof: hexToBytes(request.proofs[0]), publicSignals: request.public_signals[0]})
    // console.timeEnd("verifyProof")
    // if (!valid) {
    //   throw new Error("Invalid proof")
    // }
    // console.time("HEDecrypt")
    // var decrypted_private_scalar = await cryptoTools.HEDecrypt(this.privateHEKey, cyphertexts, ephemeral_keys)
    // console.timeEnd("HEDecrypt")
    console.time("DlogSolver")
    var dlog_solver_result = await cryptoTools.HEDecryptExternalSolver(this.privateHEKey, cyphertexts, ephemeral_keys, 
      (base_x: bigint, base_y: bigint, encoded_x: bigint, encoded_y: bigint) => this.dlogSolver.solve(base_x.toString(), base_y.toString(), encoded_x.toString(), encoded_y.toString()))
    console.timeEnd("DlogSolver")
   // console.log("DlogSolver result: ", dlog_solver_result.toString(), "Decrypted private scalar: ", decrypted_private_scalar.toString());
   // console.log("DlogSolver result === Decrypted private scalar: ", dlog_solver_result === decrypted_private_scalar);
    return {
      unpacked_private_scalar: dlog_solver_result.toString(),
    }
     
  }
  //TODO make this run in an SGX/TEE environment
  //This is probably the only function that is required to be run in an SGX/TEE environment
  //The reason to this is for operational security and secure that the randomness doesn't leave the environment
  async process_seal_request(request: SingleSealRequest): Promise<SingleSealRequestResponse> {
    var input = genCircuitInputsEncrypt(this.publicHEKey, cryptoTools.generateRandom248BitNumber());

    var point_p: cryptoTools.BabyJubExtPoint[] = []
    var empheral_p: cryptoTools.BabyJubExtPoint[] = []
    var new_public_key: [bigint, bigint] = [0n, 0n]
    var proof: any = null;
    if(request.require_proof) {
      console.log(input.encoded);
      proof = await encryptProofCircuit.generateProof({input: input.encoded});
        //var encrypted_message =

     
      var startIndex = 2
      for (let i = 0; i < 16; i+=2) {       
          point_p.push(cryptoTools.coordinatesToExtPointBigint(
            BigInt(proof.publicSignals[startIndex + i]), 
            BigInt(proof.publicSignals[startIndex + i + 1])
          ))
      }
      
      startIndex = 2 + 16
      
      for (let i = 0; i < 16; i+=2) { 
          empheral_p.push(cryptoTools.coordinatesToExtPointBigint(
            BigInt(proof.publicSignals[startIndex + i]), 
            BigInt(proof.publicSignals[startIndex + i + 1])
          ))

      }
      
      new_public_key = [
        BigInt(proof.publicSignals[0]),
        BigInt(proof.publicSignals[1])
      ]
    }else{
      var encrypted_message = cryptoTools.HEEncryptFromPoint(input.plain.privateKeyScalar,this.publicHEKey) 
      var pubKey = cryptoTools.privateScalarToPubKey(input.plain.privateKeyScalar)
      point_p = encrypted_message.encrypted_messages
      empheral_p = encrypted_message.ephemeral_keys
      new_public_key = [pubKey[0], pubKey[1]]
    }
   
    var severed_commitment_random_value = cryptoTools.generateRandom248BitNumber();
    var msg = cryptoTools.hashCypherText(
      point_p.map(point => cryptoTools.toBigIntArray(point)).flat(), 
        empheral_p.map(point => cryptoTools.toBigIntArray(point)).flat(),
        new_public_key, 
        BigInt(request.hashed_reveal_value_preimage),
        severed_commitment_random_value,
        BigInt(request.hashed_unseal_condition_root),
        BigInt(request.hashed_metadata_root)
        )
    console.log(msg);


    
    var signature = this.zkeddsa.signMessage(cryptoTools.bigInt2Buffer(this.signingPrivateKey), msg);
    
   
    return {
      proof: request.require_proof ? cryptoTools.uint8ArrayToHex(proof?.proof) : "",
      public_signals: request.require_proof ? proof?.publicSignals : [],
      address: request.address,
      cyphertexts: [...point_p.map(point => cryptoTools.toBigIntArray(point)).flat().map(bigint => bigint.toString()), ...Array(16).fill("0")].slice(0, 16) as [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string],
      empheral_keys: [...empheral_p.map(point => cryptoTools.toBigIntArray(point)).flat().map(bigint => bigint.toString()), ...Array(16).fill("0")].slice(0, 16) as [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string],
      signature_S: signature.S.toString(),
      signature_R8x: signature.R8[0].toString(),
      signature_R8y: signature.R8[1].toString(),
      new_public_key: [new_public_key[0].toString(), new_public_key[1].toString()],
      circuit_id: request.circuit_id,      
      severed_commitment_random_value: severed_commitment_random_value.toString(),
      hashed_unseal_condition_root: request.hashed_unseal_condition_root.toString(),
      hashed_metadata_root: request.hashed_metadata_root.toString()
    };
  }
}

