import { ProcessorEndpoint, ClientProcessorSealingPhase, SecretThrowawayPackage, PROTOCOL_PROCESSOR_PATHS, RevealConditions, SingleSealRequestResponse, SingleSealRequest, RevealConditionRequest, SingleSealStoragePackage, RevealCondition, SingleUnsealRequest } from "../../types/protocol/common";
import { buildPoseidon, buildBabyjub, buildEddsa } from "circomlibjs";
import { IClientSingleShareSealingProcess } from "../../types/protocol/common";
// import { BigNumber } from "ethers";
import { circomOpeningProof, cryptoTools } from "@nihilium/zkp-circuits";
import { poseidon1, poseidon2, poseidon4 } from "poseidon-lite"
// import { splitLargeNumber } from "../tools";
import axios from "axios";
//import { circuit_KEY_HE_ADD, circuit_SEVERED_COMMITMENT, EnvSettings, get_env_settings } from "../env_settings";
//import { circuit_ENCRYPT_PROOF } from "../env_settings";

// import { PubKey } from "@nihilium/noir-circuits";
import { hexToBytes } from "@noble/hashes/utils";
import { IDataStream } from "../data_stream/types";
// /import { validated_sig_he_addInputType } from "@nihilium/zkp-circuits";
//import { encryptProofCircuit } from "@nihilium/zkp-circuits";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { UnsealConditionCollection } from "../unseal_conditions/collections/UnsealConditionCollection";



const metadata_root_hash = (metadata_root: bigint, reveal_value_preimage: bigint) => {
    return poseidon2([cryptoTools.shrinkToBits(metadata_root, 247), reveal_value_preimage]).toString()
}

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
    nonces: bigint[] = []
) => {
    
    var noncesAdd = nonces;
    if(nonces.length == 0) {
        noncesAdd = cryptoTools.generateNonces();
    }
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
   
        input_circom = {
            input_add: value.toString(),
            nonceKey_add: noncesAdd.map(n => n.toString()),
            point_org: points.map(n => cryptoTools.toBigIntArray(n)).flat().map(n => n.toString()),
            ephemeralKey_org: empheralKeys.map(n => cryptoTools.toBigIntArray(n)).flat().map(n => n.toString()),

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
    
    return { encoded: input_encrypt, plain: {}, input_circom };
};

export class ClientSingleShareSealingProcess implements IClientSingleShareSealingProcess {
    //Library fields to be loaded once
    // private poseidon: any;
    // private babyJub: any;
    //private eddsa: any;   
    private zkeddsa: any;
    //private env_settings: EnvSettings;
    private processor: ProcessorEndpoint;
    private phase: ClientProcessorSealingPhase;
    
    private commitment_response?: SingleSealRequestResponse;
    private unseal_condition_root: bigint = 0n;
    private unsealConditionTemplate: UnsealConditionTemplate;
    // private unsealConditionCollection: UnsealConditionCollection;
    private secret: bigint;
    private data_streams: IDataStream[];
    private proving_hints: any;
    private reveal_value_preimage: bigint;
    private data_stream_group_preimage: bigint;
    private metadata_root: bigint;
    private keypair: cryptoTools.PrivKey; //This is on the top level so we can store it as part of state
    //private severed_commitment_preimage: bigint;
    //private secretThrowawayPackages: SecretThrowawayPackage[] = [];
    //private revealConditions: RevealConditionRequestPackage[] = [];

    constructor(
        processor: ProcessorEndpoint,        
        dataStreams: IDataStream[],
        unsealConditionTemplate: UnsealConditionTemplate,
        proving_hints: any = {},
        // unsealConditionCollection: UnsealConditionCollection
    ) {
        this.data_streams = dataStreams;
        this.processor = processor;        
        this.secret = 0n;        
        this.phase = ClientProcessorSealingPhase.NOT_STARTED;
        this.keypair = cryptoTools.genPrivKey();
        this.reveal_value_preimage = 0n;
        this.data_stream_group_preimage = 0n;
        this.metadata_root = 0n;
        //this.severed_commitment_preimage = 0n;
        this.proving_hints = proving_hints;
        this.unsealConditionTemplate = unsealConditionTemplate;
        //this.unsealConditionCollection = unsealConditionCollection;
                // this.env_settings = {
                //     sc_addresses: new Map(),
                //     sc_circuits: new Map()
                // }
    }

    async initialize(secret: bigint, metadata_root: bigint, template_inputs: {[key:string]:any} = {}, data_stream_mapping: {[key:string]:string} = {}): Promise<void> {
        if(this.phase != ClientProcessorSealingPhase.NOT_STARTED) {
            throw new Error("Sealing process already started");
        }
        this.zkeddsa = await import("@zk-kit/eddsa-poseidon");
        this.reveal_value_preimage = cryptoTools.generateRandom248BitNumber();
        this.metadata_root = metadata_root;
        //this.poseidon = await buildPoseidon();
        //this.env_settings = await get_env_settings();
        //this.babyJub = await buildBabyjub();
        var enhanced_template_inputs = Object.assign({}, template_inputs)
        enhanced_template_inputs["UnsealOpeningModule_0:metadata_root_hash"] = poseidon1([cryptoTools.shrinkToBits(this.metadata_root, 247)]);
        console.log("Metadata root: " + this.metadata_root.toString(16));
        console.log("Metadata root hash: " , enhanced_template_inputs );
        //TODO: this should be caluclated from the reveal conditions
        this.unsealConditionTemplate.compile(enhanced_template_inputs, data_stream_mapping);
        var r = await this.unsealConditionTemplate.getUnsealRoot();
        this.unseal_condition_root = BigInt(r);
        //this.severed_commitment_preimage = generateRandom248BitNumber();
        //this.eddsa = await buildEddsa();
        
        // this.data_stream_group_preimage = generateRandom248BitNumber();
        this.secret = secret;
        
        this.keypair = cryptoTools.genPrivKey();
        this.phase = ClientProcessorSealingPhase.GENERATING_SECRETS;
        //await encryptProofCircuit.init()
        // Implementation will be added later
    }

async request_commitment_to_processor(require_proof: boolean = false): Promise<SingleSealStoragePackage> {
    var commitment_request = await this.request_commitment(require_proof, false);
    const request_url = this.processor.url + PROTOCOL_PROCESSOR_PATHS.REQUEST_SEAL;
    const response = await axios.post<SingleSealRequestResponse>(
        request_url, commitment_request)
    if(response.status != 200) {
        throw new Error("Failed to request commitment");
    }
    return await this.process_seal_response(response.data);

}

    async request_commitment( require_proof: boolean = false, call_processor: boolean = true): Promise<SingleSealRequest> {
       
        if(this.phase != ClientProcessorSealingPhase.GENERATING_SECRETS) {
            throw new Error("Sealing process not in generating secrets phase");
        }
        var splitScalar = cryptoTools.splitLargeNumber(this.keypair)
        if(splitScalar.length != 8) {
            
            throw new Error("Invalid scalar" +splitScalar.length );
        }

        var hashed_reveal_value_preimage = poseidon1([this.reveal_value_preimage])
        const top_level_request: SingleSealRequest = {
            "address": "", //TODO chainedproofaddress
            "circuit_id": "", //TODO chainedproofcircuit
            "hashed_reveal_value_preimage": hashed_reveal_value_preimage.toString(),
            "hashed_metadata_root": metadata_root_hash(this.metadata_root, this.reveal_value_preimage),
            //"hashed_severed_commitment_preimage": bufferToBigInt(this.poseidon([this.severed_commitment_preimage])).toString(16),
            "hashed_unseal_condition_root": poseidon2([this.unseal_condition_root, hashed_reveal_value_preimage]).toString(),
            "require_proof": require_proof
        }
        this.phase = ClientProcessorSealingPhase.PROCESSING_COMMITMENT;
        
        

        return top_level_request;
        //this.revealConditions = response.data.signed_reveal_conditions;
        
        // Implementation will be added later
    }

    async process_seal_response(processor_response: SingleSealRequestResponse): Promise<SingleSealStoragePackage> {
        if(this.phase != ClientProcessorSealingPhase.PROCESSING_COMMITMENT) {
            throw new Error("Sealing process not in processing commitment phase");
        }
        if(processor_response.proof){

            // var proof_valid = await encryptProofCircuit.verifyProof({
            //     proof: hexToBytes(processor_response.proof),
            //     publicSignals: processor_response.public_signals,
            // })
            // if(!proof_valid) {
                this.phase = ClientProcessorSealingPhase.ERROR;
                throw new Error("Failed to verify proof");
            //}
        }
        //const encrypt_proof_circuit = await circuit_ENCRYPT_PROOF();
        // const severed_commitment_circuit = await circuit_SEVERED_COMMITMENT();
        // const key_he_add_circuit = await circuit_KEY_HE_ADD();

        // var result = await encrypt_proof_circuit.verifyProof({
        //     proof: processor_response.proof,
        //     publicSignals: processor_response.public_signals
        // })
      
        var msg = cryptoTools.hashCypherText(processor_response.cyphertexts.map(bigint => BigInt(bigint)),
         processor_response.empheral_keys.map(bigint => BigInt(bigint)),
         [BigInt(processor_response.new_public_key[0]), 
         BigInt(processor_response.new_public_key[1])],
         poseidon1([this.reveal_value_preimage]),
         BigInt(processor_response.severed_commitment_random_value),
         poseidon2([this.unseal_condition_root, poseidon1([this.reveal_value_preimage])]),
         BigInt(processor_response.hashed_metadata_root)
         )
        //var hashed_reveal_value_preimage = bufferToBigInt(this.poseidon([this.reveal_value_preimage])).toString(16)
        var hashed_reveal_value_preimage = poseidon1([this.reveal_value_preimage])
        
        var sig:any =  {
            S: BigInt(processor_response.signature_S), 
            R8: [
                BigInt(processor_response.signature_R8x), 
                BigInt(processor_response.signature_R8y)
            ]
            
        }
        

       
        
        var signatureValid = this.zkeddsa.verifySignature(msg, 
            sig, [this.processor.public_verification_key[0], this.processor.public_verification_key[1] ]); //TODO not on curve?
        // var sig_eddsa: zkeddsa.Signature = {
        //     R8: [
        //         this.babyJub.F.toObject(hexToBytes(processor_response.signature_R8x)),
        //         this.babyJub.F.toObject(hexToBytes(processor_response.signature_R8y))
        //     ],
        //     S: BigInt("0x" + processor_response.signature_S)
        // }
        // var zkeddsa_pub_key: [bigint, bigint] = [this.babyJub.F.toObject(cryptoTools.bigInt2Buffer(this.processor.public_verification_key[0])), 
        // this.babyJub.F.toObject(cryptoTools.bigInt2Buffer(this.processor.public_verification_key[1]))]
        //  var externallyValid =    zkeddsa.verifySignature(msg, sig_eddsa, zkeddsa_pub_key);
       var hashed_preimage_plus_random_value = poseidon2([
            hashed_reveal_value_preimage,
            //NOTE: we need to send the random value plain and NOT as a buffer
            //Whilst the hashed value must be a buffer
            BigInt(processor_response.severed_commitment_random_value)
        ])
        var hashed_preimage_plus_random_value_bigint = hashed_preimage_plus_random_value;
       // var hashed_combined_fe = this.babyJub.F.toObject(hashed_preimage_plus_random_value)
        //console.log(hashed_preimage_plus_random_value_bigint);
        // var severed_commitment_signatureValid = this.eddsa.verifyPoseidon(hashed_preimage_plus_random_value, 
        //     severed_commitment_sig, 
        //     [cryptoTools.bigInt2Buffer(this.processor.public_verification_key[0]), 
        //     cryptoTools.bigInt2Buffer(this.processor.public_verification_key[1]) ]); //TODO not on curve?
//processor_response.cyphertexts, processor_response.empheral_keys
        if(!signatureValid) {
            this.phase = ClientProcessorSealingPhase.ERROR;
            throw new Error("Failed to verify proof");
        }

        
        

        var encrypted_nonces = cryptoTools.generateNonces();
        var hePubKey:cryptoTools.PubKey = cryptoTools.coordinatesToExtPointBigint(this.processor.public_he_encryption_key[0], this.processor.public_he_encryption_key[1]);
        
        // ----- Validate signature and Homomorphic addition to private key -----
        const empheral_p: cryptoTools.BabyJubExtPoint[] = [];
        for (let i = 0; i < 8; i++) {
            var x = BigInt(processor_response.empheral_keys[i*2])
            var y = BigInt(processor_response.empheral_keys[i*2+1])
           
            empheral_p.push(cryptoTools.coordinatesToExtPointBigint(x,y));
        }

        const point_p: cryptoTools.BabyJubExtPoint[] = [];
        for (let i = 0; i < 8; i++) {
            var x = BigInt(processor_response.cyphertexts[i*2])
            var y = BigInt(processor_response.cyphertexts[i*2+1])
           
            point_p.push(cryptoTools.coordinatesToExtPointBigint(x,y));
        }
        /*
              var circuitInputsHEAdd = genCircuitInputsHEAdd(babyJub, keypair.pubKey, scalarToAdd, point_p, empheral_p, 
                pubValidationKey, privateKeyScalarPubKey, signature, commitment_preimage, random_severed_commit, unseal_condition_root)
       
        */
       //Note the random number is very import to be random and not signed as part of the request.
       //This is important as the processor knows the other part of the combined private key.
       //It could then figure out a relation between the seal and unseal request.
       //This does mean we can have infinite possible combinations of private keys generated
       //However only one set of unseal conditions for them, so this should not be an issue.
       var valueToAdd = cryptoTools.generateRandom248BitNumber();
       valueToAdd = cryptoTools.shrinkToBits(valueToAdd, 247);
       var metadata_root_shrinked = cryptoTools.shrinkToBits(this.metadata_root, 247);
       var test1 = this.unseal_condition_root % 21888242871839275222246405745257275088548364400416034343698204186575808495617n //babyjub modulus
       var test2 = this.unseal_condition_root % 21888242871839275222246405745257275088614511777268538073601725287587578984328n //babyjub modulus
        var input = genCircuitInputsHEAdd(hePubKey, valueToAdd,
            point_p,
            empheral_p,            
            [this.processor.public_verification_key[0], this.processor.public_verification_key[1]],
            [BigInt(processor_response.new_public_key[0]), BigInt(processor_response.new_public_key[1])],            
            sig,
            this.reveal_value_preimage,
                  
            BigInt(processor_response.severed_commitment_random_value),
            this.unseal_condition_root,
            metadata_root_shrinked,
            encrypted_nonces
        );
        console.time("circomOpeningProof.proof");
        await circomOpeningProof.init()
        var proof = await circomOpeningProof.generateProof({input: input.input_circom});
        console.timeEnd("circomOpeningProof.proof");
        //await validatedSigHeAddCircuit.init()
        //var proof = await validatedSigHeAddCircuit.generateProof({input: input.encoded});
        if(!proof) {
            this.phase = ClientProcessorSealingPhase.ERROR;
            throw new Error("Failed to generate proof");
        }
        // var random_value = BigInt("0x" + processor_response.severed_commitment_random_value)
        // const circuitInputs = {            
        //     Ax: this.babyJub.F.toObject(cryptoTools.bigInt2Buffer(this.processor.public_verification_key[0])),
        //     Ay: this.babyJub.F.toObject(cryptoTools.bigInt2Buffer(this.processor.public_verification_key[1])),
        //     S: severed_commitment_sig.S,
        //     R8x: this.babyJub.F.toObject(severed_commitment_sig.R8[0]),
        //     R8y: this.babyJub.F.toObject(severed_commitment_sig.R8[1]),
        //     random_value: random_value,
        //     pre_image: this.reveal_value_preimage
        // };

        // var proof_severed_commitment = await severed_commitment_circuit?.generateProof({input: circuitInputs});
        // if(!proof_severed_commitment) {
        //     this.phase = ClientProcessorSealingPhase.ERROR;
        //     throw new Error("Failed to generate proof");
        // }
        
        // -------------------------------------------------------------------------------------------
        //encrypt shamir secret using ECC
        // -------------------------------------------------------------------------------------------  
        var newCombinedPublicKeyX = BigInt(proof.publicSignals[39])
        var newCombinedPublicKeyY = BigInt(proof.publicSignals[40])
           
        var encrypted_shamir_key = cryptoTools.encryptECCBabyJub(this.secret, cryptoTools.coordinatesToExtPointBigint(newCombinedPublicKeyX, newCombinedPublicKeyY) )
        
        //TODO do the HEHomomorphic addition similar to the circuit and calculate them separately.
        //Make sure they are the same, if they are the same, hash them and prepare for the circuit
        //to remove the actual cihpertexts from the circuit and only return the hashes.
        //So that the cipher texts can be omitted.
        var encrypted_add_value =cryptoTools.HEEncrypt(valueToAdd + metadata_root_shrinked, cryptoTools.toBigIntArray(hePubKey), encrypted_nonces)
        
        
        
        console.debug('Generated random AES key for shamir secret encryption');
        this.phase = ClientProcessorSealingPhase.PROCESSING_INDIVIDUAL_REVEAL_CONDITIONS;
        //TODO handle additional reveal conditions
        
        return {
            private_package: {
                cyphertexts:  proof.publicSignals.slice(3,19).map(a => BigInt(a).toString()),//(proof.parsedSignals.outputs[0] as Curve[]).map(bigint => [bigint.x.toString(), bigint.y.toString()]).flat(),
                empheral_keys:  proof.publicSignals.slice(19,35).map(a => BigInt(a).toString()),//(proof.parsedSignals.outputs[1] as Curve[]).map(bigint => [bigint.x.toString(), bigint.y.toString()]).flat(),                
                public_key_he: [this.processor.public_he_encryption_key[0].toString(), this.processor.public_he_encryption_key[1].toString()],
                public_verification_key: [this.processor.public_verification_key[0].toString(), this.processor.public_verification_key[1].toString()],
                proof: "0x" + cryptoTools.uint8ArrayToHex(proof.proof),
                public_signals: proof.publicSignals,
                encrypted_secret: encrypted_shamir_key,
                unseal_template: this.unsealConditionTemplate.export_compiled_to_json(),
                unseal_condition_root: this.unseal_condition_root.toString(),
                metadata_root: this.metadata_root.toString(), //This metadata root can be hashed or even encrypted to create password protection
                reveal_value: BigInt(proof.publicSignals[0]).toString(),
                unseal_collection_id: this.unsealConditionTemplate.collection_id,
                proving_hints: this.proving_hints,
            },
            public_package: { //TODO should be different proof of the severed commitment
                reveal_value: BigInt(proof.publicSignals[0] ).toString(),
                proof: "", //proof_severed_commitment.proof,
                public_signals:"",// proof_severed_commitment.publicSignals,
                address: "", //TODO chainedproofaddress
                circuit_id: "", //TODO chainedproofcircuit
                data_stream_ids: this.data_streams.map(ds => ds.getAddress()),
                data_stream_urls: this.data_streams.map(ds => ds.getUrl()),
                processor_url: this.processor.url
            },
            hidden_package: {
               
            },
        }
            
            
    }

    get_phase(): ClientProcessorSealingPhase {
        return this.phase;
    }

    get_secret_throwaway_packages(): SecretThrowawayPackage[] {
        return [];
    }

    get_shamir_secret(): bigint {
        return this.secret;
    }

    get_reveal_conditions(): RevealConditionRequest[] {
        return [];
    }
}