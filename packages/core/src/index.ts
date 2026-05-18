/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */

// Export the main components
export * from './common_index';

import { Processor } from './lib/processor/processor';
import { precompute } from '@nihilium/zkp-circuits';

import * as DataStream from './lib/data_stream/EVMDataStreamNonZK';
import * as Persistence from './lib/persistence/DataStreamFilePersistence';

export { 
 
  Processor, 
  precompute,
  DataStream,
 
  Persistence,
 }
