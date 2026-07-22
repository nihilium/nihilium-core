/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components

// Single flat namespace for ALL domain types (protocol, proof, module, collection,
// crypto-primitive). Consumers use `types.X` (also `nhsdk.types.X`) instead of the old
// per-group namespaces. Also published as the `@nihilium/core/types` subpath.
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
//Protocol interaction interfaces
export {ClientSingleShareSealingProcess} from './lib/client/client_single_share_sealing'
export {ClientSingleShareUnsealingProcess} from './lib/client/client_single_share_unsealing'
export {NihiliumPaymentProvider, NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE} from './lib/client/payments';
export { createRevealOnlyCollection } from './lib/unseal_conditions/templates/reveal_only_template';
// Parse a stored unseal template into an UnsealConditionTemplate. Promoted to a top-level
// export (was UnsealConditionTemplate.from_json / types.from_json) because it is needed
// early in the unseal flow. Still available as `types.from_json`.
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
