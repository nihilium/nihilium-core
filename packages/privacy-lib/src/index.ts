/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components

import type * as types from './types';
import {cryptoTools} from '@nihilium/zkp-circuits';
import * as utils from './lib/utils';
import { Processor } from './lib/processor/processor';
import * as ProtocolTypes from './types/protocol/common';
import {DataStreamClient} from './lib/data_stream/DataStreamClient';
import * as DataStream from './lib/data_stream/EVMDataStreamNonZK';
import * as Persistence from './lib/persistence/DataStreamFilePersistence';
import {ClientSingleShareSealingProcess} from './lib/client/client_single_share_sealing'
import {ClientSingleShareUnsealingProcess} from './lib/client/client_single_share_unsealing'
import {EmpheralMerkleTreeWrapper} from './lib/contract_wrappers/EmpheralMerkleTreeWrapper';
import {ChainedProofWrapper} from './lib/contract_wrappers/ChainedProofWrapper';
import {NETWORK_IDS, deployedProtocolContracts} from './static_contracts';
import { DefaultAnchoredOpeningProofCollection } from './lib/unseal_conditions/collections/default_anchored_opening_proof';
import { ChainedProofCollection} from './lib/unseal_conditions/types';
var contracts = {
  EmpheralMerkleTree: EmpheralMerkleTreeWrapper,
  ChainedProofWrapper: ChainedProofWrapper
} 

//TODO: do this dynamically
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
  ProtocolTypes,
  DataStream,
  DataStreamClient,
  Persistence,
  contracts, 
  utils,
  ProofCollections,
  ChainedProofCollection,
  deployedProtocolContracts,
  NETWORK_IDS,
  types }
