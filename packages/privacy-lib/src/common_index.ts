/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components

import type * as types from './types';
import {cryptoTools} from '@nihilium/zkp-circuits';
import * as utils from './lib/utils';
//import { Processor } from './lib/processor/processor';
import * as ProtocolTypes from './types/protocol/common';
import {DataStreamClient} from './lib/data_stream/DataStreamClient';
//import * as DataStream from './lib/data_stream/EVMDataStreamNonZK';
//import * as Persistence from './lib/persistence/DataStreamFilePersistence';
import {ClientSingleShareSealingProcess} from './lib/client/client_single_share_sealing'
import {ClientSingleShareUnsealingProcess} from './lib/client/client_single_share_unsealing'
import {EmpheralMerkleTreeWrapper} from './lib/contract_wrappers/EmpheralMerkleTreeWrapper';
import {ChainedProofWrapper} from './lib/contract_wrappers/ChainedProofWrapper';
import {NETWORK_IDS, deployedProtocolContracts} from './static_contracts';
import { StandardProofLibrary } from './lib/unseal_conditions/proofs';
export {ProofLibraryType, StandardProofLibrary as StandardProofLibrary} from './lib/unseal_conditions/proofs';
export {ModuleLibraryType, StandardModuleLibrary as StandardModuleLibrary} from './lib/unseal_conditions/modules';
import { StandardModuleLibrary } from './lib/unseal_conditions/modules';
export { createRevealOnlyCollection } from './lib/unseal_conditions/templates/reveal_only_template';
export { UnsealConditionCollection  } from './lib/unseal_conditions/collections/UnsealConditionCollection';
export { UnsealConditionTemplate, from_json as unseal_condition_template_from_json } from './lib/unseal_conditions/collections/UnsealConditionTemplate';
var contracts = {
  EmpheralMerkleTree: EmpheralMerkleTreeWrapper,
  ChainedProofWrapper: ChainedProofWrapper
} 


export var proofLibrary = new StandardProofLibrary();
export var moduleLibrary = new StandardModuleLibrary();
export { 
  cryptoTools,
  ClientSingleShareSealingProcess,
  ClientSingleShareUnsealingProcess, 
  
  ProtocolTypes,
  
  DataStreamClient,
  
  contracts, 
  utils,
  
  
  deployedProtocolContracts,
  NETWORK_IDS,
  types }
