import { IDataStream } from "../../lib/data_stream/types";
import { CompiledCollectionExport, RequiredUserInput } from "../../lib/unseal_conditions/collections/types";

import { UnsealProofAction } from "../../lib/unseal_conditions/types";
import { ProofPath } from "fixed-merkle-tree";

export type HexString = string ;//& { __brand: 'HexString' };

// Regex for hex string validation
const hexRegex = /^[0-9a-fA-F]+$/;

// Function to validate hex string
//TODO later to be used to validate hex strings for custom parser with AXIOS
function isHexString(value: string): value is HexString {
  return hexRegex.test(value);
}
export type PaymentProof = string;
export type OpeningCondition = { address: string }

export type RequestPackageStageOne = { public_key: string, payment_proof?:PaymentProof };
export type RequestPackageStageTwo = {
    encrypted_payment_proof: string,
    
}

export enum RevealConditions { 
    TOP_LEVEL = "top_level",
    TIMELOCK = "timelock",
    IDENTITY_PROOF = "identity_proof",
    NON_INTERVENTION_PROOF = "non_intervention_proof",
}

export const PROTOCOL_PROCESSOR_PATHS = {
    REQUEST_SEAL: "/request_seal",
    REQUEST_UNSEAL: "/request_unseal",
    GET_PUBLIC_KEYS: "/get_public_keys",
}

export const PROTOCOL_DATA_STREAM_PATHS = {
    POST_DATA: "/postData",
    GET_PROOF: "/proof/",
    IS_PROVABLE: "/isProvable/",
    GET_GLOBAL_TREE_INDEX: "/globalTreeIndex",
    GET_ADDRESS: "/address",
    GET_LATEST_GLOBAL_LEAF_PROOF: "/latestGlobalLeafProof",
}


export type ProcessorEndpoint = {
    url: string,
    is_tor: boolean,
    public_verification_key: [bigint, bigint], //Ax, Ay
    public_he_encryption_key: [bigint, bigint], //Ax, Ay
    server_address: HexString

}

export enum ClientProcessorSealingPhase {
    NOT_STARTED = -1,
    GENERATING_SECRETS = 0,
    REQUEST_COMMITMENT = 1,
    PROCESSING_COMMITMENT = 2,
    PROCESSING_INDIVIDUAL_REVEAL_CONDITIONS = 3,
    ENCRYPTING_SHAMIR_SECRET = 4,
    DONE = 5,
    ERROR = -99
}
export interface IClientSingleShareSealingProcess {
    initialize(secret: bigint, metadata_root: bigint, template_inputs: {[key:string]:any}): Promise<void>
    request_commitment(call_processor: boolean): Promise<SingleSealRequest>
    process_seal_response(processor_response: SingleSealRequestResponse): Promise<SingleSealStoragePackage>
    get_phase(): ClientProcessorSealingPhase
    get_secret_throwaway_packages(): SecretThrowawayPackage[]
    get_reveal_conditions(): RevealConditionRequest[]
}

export interface IClientSingleShareUnsealingProcess {
    initialize(seal: SingleSealStoragePackage): Promise<void>
    reveal_value_published(): Promise<boolean>
    get_unsealing_status(): Promise<UnsealingStatus>
    get_processor_status(): Promise<ProcessorStatus>
    display_reveal_conditions(): Promise<void>
    publish_reveal_value(data_stream_id: string): Promise<void>
    start_unsealing(proof_index: number, proofs: any[], public_inputs: any[][]): Promise<SingleUnsealRequest>
    process_unseal_response(processor_response: SingleSealUnsealRequestResponse): Promise<bigint>

}

export type SingleSealUnsealRequestResponse = {
   
    unpacked_private_scalar: string,
}

export enum UnsealingStatus {
    NOT_STARTED = 0,
    REVEALING_INITIAL_CONDITION = 1,
    REVEAL_VALUE_SENT = 2,
    REVEAL_VALUE_EXPOSED = 3,
    AWAIT_OTHER_SEAL_CONDITIONS = 4,
    UNSEAL_POSSIBLE = 5,
    UNSEALING_IN_PROGRESS = 6,
    DONE = 7,
    ERROR = -99
}

export enum ProcessorStatus {
    AVAILABLE = 0,
    WARN_STAKE_DECREASING = 1,
    WARN_STAKE_LOW = 2,
    WARN_STAKE_CRITICAL = 3,
    UNAVAILABLE = 4,
    NEW_PUBLIC_KEYS_REQUIRED = 5,
    ERROR = -99
}
/**
 * Throwaway packages are local to the client during the sealing phase.
 * After the sealing phase is done, the throwaway packages/values are removed to secure unlinkability.
 */
export type SecretThrowawayPackage = {}

/**
 * This is an abstract type for all public packages.
 * Packages marked as public can be shared externally to watch for events that relate to 
 * initiation of the revealing phase. Can be sent to centralized services to notify them of events.
 * 
 */
export type PublicPackage = {}

/**
 * This is an abstract type for all hidden packages.
 * This meant to be stored behind a password, here might live potentially linkable information.
 * There is no direct purpose for this package YET.
 */
export type HiddenPackage = {}


/**
 * This is an abstract type for all local private packages.
 * It is meant to be stored with the client to generate reveal proofs.
 * Packages marked as private can be used to initiate the revealing phase
 */
export type PrivatePackage = {}
//TODO Hash chain proofs

export type StaticCircuitInput = {
    circuit_id: HexString,
    inputfield_name: string,
    value: HexString,
}

export type ChainedCircuitInput = {
    source_circuit_id: HexString,
    source_circuit_index: number,
    target_circuit_id: HexString,
    outputfield_index: number,
    inputfield_name: string,
}

export type RevealCondition = {
    address: HexString,
    circuit_id: HexString,
    static_inputs: StaticCircuitInput[],
    chained_inputs: ChainedCircuitInput[],
    random_value: HexString, //Extra random value for the severed commitment
    proof: any,
    public_signals: any
}


/**
 * This is an abstract type for all reveal condition request packages.
 * The request packages will be signed separately if the processor supports the address and circuit.
 * 
 */
export type RevealConditionRequest = {
    address: HexString,
    circuit_id: HexString,
    hashed_input_fields: HexString,
    random_value: HexString,
    proof: any,
    public_signals: any
}

export type UnsealRevealConditionRequest = {
    //The proof here is just to convice the processor
    proof: HexString,
    commitment: HexString,
    public_signals: HexString[]
    
}


export type RevealConditionRequestResponse = {
    address: HexString,
    circuit_id: HexString,
    hashed_input_fields: HexString,
    random_value: HexString
    signature_S: HexString,
    signature_R8x: HexString,
    signature_R8y: HexString
}


export type SingleSealRequest = {
    address: HexString,
    circuit_id: HexString,    
    hashed_reveal_value_preimage: HexString,
    hashed_unseal_condition_root: HexString,
    hashed_metadata_root: HexString,
    require_proof: boolean,
}

export type SingleSealRequestResponse = {
    address: HexString,
    circuit_id: HexString,
    cyphertexts: [HexString, HexString, HexString, HexString, HexString, HexString, HexString, HexString, HexString
        , HexString, HexString, HexString, HexString, HexString, HexString, HexString],
    empheral_keys: [HexString, HexString, HexString, HexString, HexString, HexString, HexString, HexString, HexString
        , HexString, HexString, HexString, HexString, HexString, HexString, HexString],
    signature_S: HexString,
    signature_R8x: HexString,
    signature_R8y: HexString,    
    new_public_key: [HexString, HexString],
    // severed_commitment_signature_S: HexString,
    // severed_commitment_signature_R8x: HexString,
    // severed_commitment_signature_R8y: HexString,
    severed_commitment_random_value: HexString,

    proof: HexString,
    public_signals: HexString[],
    hashed_unseal_condition_root: HexString,
    hashed_metadata_root: HexString,

}

export type SingleUnsealRequest = {
    address: HexString,
    circuit_id: HexString,
    public_key: [HexString, HexString]
    signature_S: HexString,
    signature_R8x: HexString,
    signature_R8y: HexString,
    proof: HexString,
    public_signals: HexString[][],
    proofs:HexString[],
    empheral_keys: HexString[],
    cyphertexts: HexString[],
    data_stream_address: HexString, //TODO make this an array of possible addresses
    unseal_proof_actions: UnsealProofAction[],
    unseal_root_proof: ProofPath
}

export type SingleSealStoragePackage = {
    private_package: SingleShareSealPrivatePackage,
    public_package: SingleShareSealPublicPackage,
    hidden_package: SingleShareSealHiddenPackage
    

}

export type ECCEncryptedMessage = {
    ciphertextHex: HexString;
    R: {
        x: HexString;
        y: HexString;
    };
}

export type UnsealConditionTemplateExport = {
    name: string;
    description: string;
    unseal_proof_actions: UnsealProofAction[][];
    user_inputs: RequiredUserInput[][];
    used_input_mapping: {[key: string]: string};
    compiled_collection: CompiledCollectionExport;
    collection_id: string;
}
export type SingleShareSealPrivatePackage = PrivatePackage & {
    cyphertexts: HexString[],
    empheral_keys: HexString[],
    proof: any,
    public_signals: any,
    public_key_he: [HexString, HexString],
    public_verification_key: [HexString, HexString],
    encrypted_secret: ECCEncryptedMessage,
    reveal_value: HexString,
    unseal_condition_root: HexString,
    metadata_root: HexString,
    unseal_template: UnsealConditionTemplateExport,
    proving_hints: any,
    unseal_collection_id: string
    
}

export type SingleShareSealPublicPackage = PublicPackage & {
    reveal_value: HexString,
    address: HexString,
    circuit_id: HexString,
    data_stream_ids: HexString[],
    proof: any,
    public_signals: any,
    data_stream_urls: string[]
    processor_url: string,
}

export type SingleShareSealHiddenPackage = HiddenPackage & {
    // committed_public_key: [bigint, bigint],
    // proof: any,
    // public_signals: any,
}


export type ThrowAwayShamirSecret = {
    shamir_secret: bigint,
    secret_ecc_scalar: bigint, //max 248 bit
    ecc_public_key: [bigint, bigint], //Ax, Ay
    
}