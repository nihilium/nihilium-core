/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components

import type * as types from './types';
//Expose cryptoTools from zkp-circuits
export {cryptoTools} from '@nihilium/zkp-circuits';
import * as utils from './lib/utils';

//import { Processor } from './lib/processor/processor';
import * as protocolTypes from './types/protocol/common';
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
export {EmpheralMerkleTreeWrapper} from './lib/contract_wrappers/EmpheralMerkleTreeWrapper';


export {ChainedProofWrapper} from './lib/contract_wrappers/ChainedProofWrapper';


//Proof, Module and collection constructions
export {ProofLibraryType, StandardProofLibrary, standardProofs} from './lib/unseal_conditions/proofs';
export {ModuleLibraryType, StandardModuleLibrary} from './lib/unseal_conditions/modules';
import * as ProofTypes from './lib/unseal_conditions/proofs/types';
export { ProofTypes };
import * as ModuleTypes from './lib/unseal_conditions/modules/types';
export { ModuleTypes };

import * as CollectionTypes from './lib/unseal_conditions/collections/types';
export { CollectionTypes };

import * as UnsealConditionCollectionTypes from './lib/unseal_conditions/collections/UnsealConditionCollection';
export { UnsealConditionCollectionTypes };


import * as CollectionTemplateTypes from './lib/unseal_conditions/collections/UnsealConditionTemplate';
export { CollectionTemplateTypes };
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
export { 
  utils,
  protocolTypes,
  
  
  
  types }
