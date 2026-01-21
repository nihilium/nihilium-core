/**
 * Privacy Library
 * 
 * A TypeScript library for privacy-preserving computations using Circom
 */
export * from './common_index';

// Export the main components
const stub = {}
var Persistence = stub;
var Processor = stub;
var DataStream = stub;
var precompute = (stub: any) => { return stub; };
export { 
  
  Processor, 
  DataStream,
  Persistence,
  precompute
 }
