/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components
import { Buffer } from 'buffer';
import * as utils from './lib/utils';
import type * as types from './types';
import {cryptoTools} from '@nihilium/zkp-circuits';

// import * as Processor from './lib/processor';
import {DataStreamClient} from './lib/data_stream/DataStreamClient';
// import * as Persistence from './lib/persistence/DataStreamFilePersistence';
import {ClientSingleShareSealingProcess} from './lib/client/client_single_share_sealing'
import {ClientSingleShareUnsealingProcess} from './lib/client/client_single_share_unsealing'
import {EmpheralMerkleTreeWrapper} from './lib/contract_wrappers/EmpheralMerkleTreeWrapper';
import {ChainedProofWrapper} from './lib/contract_wrappers/ChainedProofWrapper';
import {NETWORK_IDS, deployedProtocolContracts} from './static_contracts';
import * as ProtocolTypes from './types/protocol/common';
import { DefaultAnchoredOpeningProofCollection } from './lib/unseal_conditions/collections/default_anchored_opening_proof';
import { ChainedProofCollection} from './lib/unseal_conditions/types';
const stub = {}
var Persistence = stub;
var Processor = stub;
var DataStream = stub;
var contracts = {
  EmpheralMerkleTree: EmpheralMerkleTreeWrapper,
  ChainedProofWrapper: ChainedProofWrapper
} 
var ProofCollections: any = {
  default: {
    "default_anchored_opening_proof": DefaultAnchoredOpeningProofCollection,
  }
} 

export { 
  cryptoTools,
  ClientSingleShareSealingProcess,
  ClientSingleShareUnsealingProcess, 
  Processor, 
  DataStream,
  DataStreamClient,
  Persistence,
  contracts, 
  ChainedProofCollection,
  ProofCollections,
  utils,
  deployedProtocolContracts,
  NETWORK_IDS,
  ProtocolTypes,
    types }
