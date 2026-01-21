// import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
// import { InputMap, Noir } from '@noir-lang/noir_js';
// import type { CircuitConfig, CircuitWrapper, ProofOptions, VerifyOptions } from './types/circuit_wrapper';
// // import { resolvePath, detectEnvironment, loadCircuitJson } from './wasm-loader';
// import { sha256 } from "@noble/hashes/sha2";
// import { bytesToHex } from '@noble/hashes/utils';
// import { detectEnvironment } from './wasm-loader';
// export class WrappedNoirCircuit<T extends InputMap> implements CircuitWrapper<T> {
//   //private config: CircuitConfig;
//   private circuit_json: any = null;
//   private noir: Noir | null = null;
//   private barretenberg: UltraHonkBackend | null = null;
//   private id: string;
//   // Public paths for external access
//   public resolvedCircuitPath: string = '';
//   constructor(json_circuit_path: string | object) {
//     // if (typeof json_circuit_path === 'string') {
//     //   this.resolvedCircuitPath = json_circuit_path;
//     // } else {
//       this.circuit_json = json_circuit_path;
//       // Hash the bytecode to generate a unique id
//       this.id = typeof this.circuit_json.bytecode === 'string'
//         ? bytesToHex(sha256(this.circuit_json.bytecode))
//         : '';
//     // }
//     // this.config = {     
//     //   environment: detectEnvironment()
//     // };
//   }
//   get_id(): string {
//     return this.id;
//   }
//   async init(): Promise<void> {
//     // Initialize Barretenberg
//     // if(!this.circuit_json) {
//     //   this.resolvedCircuitPath = resolvePath(this.resolvedCircuitPath, this.config.environment);
//     //   this.circuit_json = await loadCircuitJson(this.resolvedCircuitPath, this.config.environment);
//     // }
//     if(this.noir == null) {
//       this.noir = new Noir(this.circuit_json);
//     }
//     if(this.barretenberg == null) {
//       // Get available cores based on environment
//       let availableCores: number;
//       const environment = detectEnvironment();
//       if (environment === 'browser' && typeof navigator !== 'undefined') {
//         availableCores = navigator.hardwareConcurrency || 4;
//       } else {
//         // Node.js environment - use os.cpus()
//         const os = require('os');
//         availableCores = os.cpus().length;
//       }
//       const threads = Math.max(1, availableCores - 2);
//       console.log("Using", threads, "threads");
//       const initialMemoryInBytes = 256 * 1024 * 1024; // 512MB
//       const memoryInBytes = 384 * 1024 * 1024; // 512MB
//       const pageSize = 64 * 1024; // 64KB per page
//       const memoryInPages = Math.ceil(memoryInBytes / pageSize);
//       const initialMemoryInPages = Math.ceil(initialMemoryInBytes / pageSize);
//       this.barretenberg = new UltraHonkBackend(this.circuit_json.bytecode, { threads: threads 
//       , memory: {
//         //initial: initialMemoryInPages,
// //        maximum: memoryInPages * 
//       }
//       }, {
//         recursive: false
//       });
//     }
//     console.log("Init done")
//   }
//   async generateProof(options: ProofOptions<T>): Promise<{
//     proof: Uint8Array;
//     publicSignals: string[];
//   }> {
//     if (!this.noir || !this.barretenberg) {
//       throw new Error('Circuit not initialized. Call init() first.');
//     }
//     const { input } = options;
//     // Generate the proof
//     const witness = await this.noir.execute(input);
//     const proof = await this.barretenberg.generateProof(witness.witness,{
//       keccak: true
//     });
//     return {
//       proof: proof.proof,
//       publicSignals: proof.publicInputs,
//     }
//   }
//   async verifyProof(zkProof: {proof: Uint8Array, publicSignals: string[]}): Promise<boolean> {
//     if (!this.noir || !this.barretenberg) {
//       throw new Error('Circuit not initialized. Call init() first.');
//     }
//     //const { proof, publicInputs } = noirProof;
//     // Verify the proof
//     return  await this.barretenberg.verifyProof({
//       proof: zkProof.proof,
//       publicInputs: zkProof.publicSignals
//     }, {
//       keccak: true
//     });// await this.noir.verifyProof(proof, publicSignals);
//   }
//   private parseSignals(signals: any[]): {
//     outputs: Record<string, bigint | bigint[]>,
//     inputs: Record<string, bigint | bigint[]>
//   } {
//     // Implement signal parsing based on your circuit's structure
//     return {
//       outputs: {},
//       inputs: {}
//     };
//   }
// }
// // export async function createNoirCircuit(config: CircuitConfig): Promise<WrappedNoirCircuit> {
// //   const circuit = new WrappedNoirCircuit(config);
// //   await circuit.init();
// //   return circuit;
// // }
// export { CircuitConfig }; 
