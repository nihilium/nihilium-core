/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components

// Single flat namespace for ALL domain types (protocol, proof, module, collection,
// crypto-primitive). Consumers use `types.X` (also `nhsdk.types.X`). Also published as the
// `@nihilium/core/types` subpath.
export * as types from './types/public';
//Expose cryptoTools from zkp-circuits
export {cryptoTools} from '@nihilium/zkp-circuits';
import * as utils from './lib/utils';

//import { Processor } from './lib/processor/processor';
export {DataStreamClient} from './lib/data_stream/DataStreamClient';
export type { IDataStream, IDualDataStream, ProofResult, LatestGlobalLeafProofResult, DualProofResult, DualLatestGlobalLeafProofResult } from './lib/data_stream/types';
//import * as DataStream from './lib/data_stream/EVMDataStreamNonZK';
//import * as Persistence from './lib/persistence/DataStreamFilePersistence';
//Network selection
export {NETWORK_IDS, deployedProtocolContracts, toAddressMap} from './static_contracts';
// High-level threshold clients — the public sealing/unsealing API. The low-level single-share
// process classes are intentionally NOT exported; they are internal building blocks of these clients.
export { NihiliumSealingClient, NihiliumSealingStatus } from './lib/client/sealing_client'
export { NihiliumUnsealingClient, NihiliumUnsealingStatus } from './lib/client/unsealing_client'
export type { NihiliumUnsealingClientOptions, StartUnsealingOptions } from './lib/client/unsealing_client'
// Scenario-specific unsealing clients (subclasses that plug proof-production logic into the base).
export { DefaultUnsealingClient } from './lib/client/scenarios/default_unsealing_client'
// The ZKEmail scenario (use-case-focused) now lives in @nihilium/client-sdk, built on the
// NihiliumUnsealingClient mechanism above.
// Sealing/unsealing options, phases and pluggable state persistence (resume support).
export {
    NihiliumEncryptionMode,
    ProcessorSealPhase,
    ProcessorUnsealPhase,
    InMemorySealingStateStore,
    LocalStorageSealingStateStore,
    defaultSealingStateStore,
    InMemoryUnsealingStateStore,
    LocalStorageUnsealingStateStore,
    defaultUnsealingStateStore,
    InMemoryClientStateStore,
    LocalStorageClientStateStore,
    defaultClientStateStore,
} from './lib/client/types'
export type {
    ProcessorSealRecord,
    SerializedSealingState,
    SealingStateStore,
    ProcessorUnsealRecord,
    SerializedUnsealingState,
    UnsealingStateStore,
    ClientStateStore,
} from './lib/client/types'
// Unseal proof-production: the producer owns the per-path proof mechanism (formerly runPath) and the
// shared/per-processor routing; the resolver/event types describe its external-input contract.
export { UnsealPathProducer } from './lib/unseal_conditions/UnsealPathProducer'
export type { UnsealResolver, UnsealResolvers, UnsealModuleEvent } from './lib/unseal_conditions/UnsealPathProducer'
export { UnsealModuleError, UnsealModulePhase } from './lib/unseal_conditions/UnsealPathProducer'
export {NihiliumPaymentProvider, NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE} from './lib/client/payments';
export type { PaymentProvider } from './lib/client/payments';
export { createRevealOnlyCollection } from './lib/unseal_conditions/templates/reveal_only_template';
// Parse a stored unseal template into an UnsealConditionTemplate. Exposed as a top-level
// export because it is needed early in the unseal flow. Also available as `types.from_json`.
export { from_json as collection_from_json } from './lib/unseal_conditions/collections/UnsealConditionTemplate';
export {EmpheralMerkleTreeWrapper} from './lib/contract_wrappers/EmpheralMerkleTreeWrapper';


export {ChainedProofWrapper} from './lib/contract_wrappers/ChainedProofWrapper';


//Proof, Module and collection constructions
export {ProofLibraryType, StandardProofLibrary, standardProofs} from './lib/unseal_conditions/proofs';
export {ModuleLibraryType, StandardModuleLibrary} from './lib/unseal_conditions/modules';
// The former ProofTypes / ModuleTypes / CollectionTypes / UnsealConditionCollectionTypes /
// CollectionTemplateTypes / protocolTypes namespaces are now flattened into `types` above.
// var contracts = {
//   EmpheralMerkleTree: EmpheralMerkleTreeWrapper,
//   ChainedProofWrapper: ChainedProofWrapper
// } 
export * as standardModules from './lib/unseal_conditions/modules';

import { StandardModuleLibrary } from './lib/unseal_conditions/modules';
import { StandardProofLibrary } from './lib/unseal_conditions/proofs';


//instances of the libraries
export var proofLibrary = new StandardProofLibrary();
export var moduleLibrary = new StandardModuleLibrary();
export { utils }
