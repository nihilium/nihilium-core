/**
 * Circuit Wrapper
 * Self-contained assets via URL resolution (Vite/rollup friendly, Node+browser)
 */
import { detectEnvironment, resolvePath, loadWasm, loadZKey, loadVKey } from './wasm-loader';
import type { CircuitConfigCircom, CircuitWrapper, ProofOptions } from './types/circuit_wrapper';

export class WrappedCircomCircuitOld implements CircuitWrapper<any> {
  private config: CircuitConfigCircom;
  private wasmModule: WebAssembly.Module | null = null;
  private zkey: any = null;
  private vkey: any = null;
  private snarkjs: any = null;
  private signals: { inputs: string[]; outputs: string[] } = { inputs: [], outputs: [] };

  public resolvedWasmPath = '';
  public resolvedZkeyPath = '';
  public resolvedVkeyPath = '';
  public resolvedSignalsPath = '';
  public environment: 'node' | 'browser' = detectEnvironment();
  public id = '';

  constructor(config: CircuitConfigCircom) {
    this.config = { ...config };
  }

  get_id(): string {
    return this.id;
  }

  /**
   * Initialize the circuit and resolve artifact URLs/paths.
   * Expects config paths to be relative to *this module* or full URLs.
   * Example:
   *   wasmPath: './circuits/mycircuit.wasm'
   *   zkeyPath: './circuits/mycircuit.zkey'
   *   vkeyPath: './circuits/mycircuit.vkey.json'
   */
  async init(): Promise<void> {
    // Resolve asset locations so bundlers emit + link correctly
    this.resolvedWasmPath = await resolvePath(this.config.wasmPath, this.environment);
    this.resolvedZkeyPath = await resolvePath(this.config.zkeyPath, this.environment);
    if (this.config.vkeyPath) {
      this.resolvedVkeyPath = await resolvePath(this.config.vkeyPath, this.environment);
    }

    // Optional preloads (not required for snarkjs.fullProve, kept for compatibility)
    if (this.wasmModule == null) {
      this.wasmModule = await loadWasm(this.resolvedWasmPath, this.environment);
    }
    if (this.zkey == null) {
      this.zkey = await loadZKey(this.resolvedZkeyPath, this.environment);
    }
    if (this.config.vkeyPath && this.vkey == null) {
      this.vkey = await loadVKey(this.resolvedVkeyPath, this.environment);
    }

    // Load snarkjs in a way that works in ESM Node and browser
    if (!this.snarkjs) {
      // Prefer dynamic import (ESM-safe). If consumer is CJS-only Node, they can transpile or use createRequire.
      this.snarkjs = await import('snarkjs');
      // Some distros expose default export; normalize
      if (this.snarkjs?.default?.groth16 && !this.snarkjs.groth16) this.snarkjs = this.snarkjs.default;
    }
  }

  /**
   * Generate a zero-knowledge proof for the given inputs.
   * Returns the proof object and public signals.
   * Use encodeProofForContract() to convert the proof to bytes for smart contract verification.
   */
  async generateProof(options: ProofOptions<any>): Promise<{ rawProof?: any; circomProof?: any; proof: any; publicSignals: string[] }> {
    if (!this.resolvedWasmPath || !this.resolvedZkeyPath || !this.snarkjs) {
      throw new Error('Circuit not initialized. Call init() first.');
    }
    const { input } = options;

    // Pass URL (browser) or filesystem path (Node). snarkjs handles both.
    this.snarkjs.groth16.generateWitness(input, this.resolvedWasmPath, this.resolvedZkeyPath);
    const result = await this.snarkjs.groth16.fullProve(input, this.resolvedWasmPath, this.resolvedZkeyPath);

    /* PROOF output
{
  pi_a: [
    "14565694003989163472557074743905817081282996171701122060948851524484504093842",
    "16315538462961313252206152440050969448052709886626507664422074952754489356465",
    "1",
  ],
  pi_b: [
    [
      "12201512584432098878959731499163466495299464015702299544102715175089727458093",
      "7882099543071412014145879554967549153368839999504991433254464295725242343425",
    ],
    [
      "6932680429713163065483328090369563164880939152261125042708485176797693378703",
      "18258374916448149500886974189665769967948959635364324852663191400553332942953",
    ],
    [
      "1",
      "0",
    ],
  ],
  pi_c: [
    "13175579995983924985498875994838446638095739634602532988040407227278582027450",
    "4106816848636829259116688984869270919082550390799818237113133658655478119065",
    "1",
  ],
  protocol: "groth16",
  curve: "bn128",
}
    */
   var reseult = await this.verifyProof({proof: result.proof, publicSignals: result.publicSignals.map(signal => "0x" + BigInt(signal).toString(16).padStart(64, '0'))});
   var solidityCallData = await this.snarkjs.groth16.exportSolidityCallData(result.proof, result.publicSignals);
    return {
      rawProof: result.proof,
      proof: this.encodeProofForContract(result.proof),
      circomProof: this.formatProofForSolidity(result.proof),
      publicSignals: result.publicSignals.map(signal => "0x" + BigInt(signal).toString(16).padStart(64, '0')),
    };
  }

  /**
   * Format circom proof object with Solidity-compatible hex strings.
   * Converts all numeric strings to 0x-prefixed hex format.
   */
  private formatProofForSolidity(proof: any): any {
    const toHex = (value: string) => "0x" + BigInt(value).toString(16).padStart(64, '0');
    
    return {
      pi_a: [toHex(proof.pi_a[0]), toHex(proof.pi_a[1])],
      pi_b: [
        [toHex(proof.pi_b[0][0]), toHex(proof.pi_b[0][1])],
        [toHex(proof.pi_b[1][0]), toHex(proof.pi_b[1][1])]
       
      ],
      pi_c: [toHex(proof.pi_c[0]), toHex(proof.pi_c[1])],
      protocol: proof.protocol,
      curve: proof.curve
    };
  }

  fieldToIndex(field: string): number {
    return this.signals.outputs.indexOf(field);
  }

  indexToField(index: number): string {
    return this.signals.outputs[index];
  }

  /**
   * Verify a zero-knowledge proof locally using the verification key.
   * @param zkProof The proof object and public signals from generateProof()
   *                Can accept either hex-formatted or decimal string format
   */
  async verifyProof(zkProof: { proof: any; publicSignals: string[] }): Promise<boolean> {
    if (!this.vkey || !this.snarkjs) {
      throw new Error('Circuit not initialized or verification key not loaded. Call init() first.');
    }
    let { proof, publicSignals } = zkProof;
    
    // Convert hex proof back to decimal strings for snarkjs
    if (proof.pi_a && typeof proof.pi_a[0] === 'string' && proof.pi_a[0].startsWith('0x')) {
      proof = this.hexProofToDecimal(proof);
    }
    
    // Convert hex publicSignals back to decimal strings for snarkjs
    const decimalSignals = publicSignals.map(signal => {
      if (typeof signal === 'string' && signal.startsWith('0x')) {
        return BigInt(signal).toString();
      }
      return signal;
    });
    
    return await this.snarkjs.groth16.verify(this.vkey, decimalSignals, proof);
  }

  /**
   * Convert hex-formatted proof back to decimal strings for snarkjs.
   */
  private hexProofToDecimal(hexProof: any): any {
    const toDecimal = (value: string) => typeof value === 'string' && value.startsWith('0x') ? BigInt(value).toString() : value;
    
    return {
      pi_a: [toDecimal(hexProof.pi_a[0]), toDecimal(hexProof.pi_a[1]), hexProof.pi_a[2]],
      pi_b: [
        [toDecimal(hexProof.pi_b[0][0]), toDecimal(hexProof.pi_b[0][1])],
        [toDecimal(hexProof.pi_b[1][0]), toDecimal(hexProof.pi_b[1][1])],
        hexProof.pi_b[2]
      ],
      pi_c: [toDecimal(hexProof.pi_c[0]), toDecimal(hexProof.pi_c[1]), hexProof.pi_c[2]],
      protocol: hexProof.protocol,
      curve: hexProof.curve
    };
  }

  /**
   * Encode proof for smart contract verification.
   * Converts the snarkjs proof object into a single Uint8Array matching the format expected by
   * the Solidity verify(bytes calldata _proof, bytes32[] calldata _publicInputs) function.
   * 
   * Format: abi.encodePacked(uint[2] _pA, uint[2][2] _pB, uint[2] _pC)
   * - _pA: pi_a[0], pi_a[1] (64 bytes)
   * - _pB: pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1] (128 bytes)
   * - _pC: pi_c[0], pi_c[1] (64 bytes)
   * Total: 256 bytes
   */
  encodeProofForContract(proof: any): Uint8Array {
    const result = new Uint8Array(256);
    let offset = 0;

    // Helper function to convert a bigint string to 32-byte big-endian Uint8Array
    const bigIntToBytes32 = (value: string): Uint8Array => {
      const bytes = new Uint8Array(32);
      let bigIntValue = BigInt(value);
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(bigIntValue & 0xFFn);
        bigIntValue = bigIntValue >> 8n;
      }
      return bytes;
    };

    // Encode _pA (pi_a[0], pi_a[1])
    result.set(bigIntToBytes32(proof.pi_a[0]), offset);
    offset += 32;
    result.set(bigIntToBytes32(proof.pi_a[1]), offset);
    offset += 32;

    // Encode _pB (pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1])
    result.set(bigIntToBytes32(proof.pi_b[0][0]), offset);
    offset += 32;
    result.set(bigIntToBytes32(proof.pi_b[0][1]), offset);
    offset += 32;
    result.set(bigIntToBytes32(proof.pi_b[1][0]), offset);
    offset += 32;
    result.set(bigIntToBytes32(proof.pi_b[1][1]), offset);
    offset += 32;

    // Encode _pC (pi_c[0], pi_c[1])
    result.set(bigIntToBytes32(proof.pi_c[0]), offset);
    offset += 32;
    result.set(bigIntToBytes32(proof.pi_c[1]), offset);

    return result;
  }

  /**
   * Decode proof from smart contract format back to circom format.
   * Converts a 256-byte Uint8Array (from smart contract) back into the original
   * circom proof object structure.
   * 
   * @param encodedProof 256-byte Uint8Array in the format: abi.encodePacked(uint[2] _pA, uint[2][2] _pB, uint[2] _pC)
   * @returns Proof object with pi_a, pi_b, pi_c fields
   */
  decodeProofFromContract(encodedProof: Uint8Array): any {
    if (encodedProof.length !== 256) {
      throw new Error(`Invalid proof length: expected 256 bytes, got ${encodedProof.length}`);
    }

    // Helper function to convert 32-byte big-endian Uint8Array to bigint string
    const bytes32ToBigInt = (bytes: Uint8Array): string => {
      let value = 0n;
      for (let i = 0; i < 32; i++) {
        value = (value << 8n) | BigInt(bytes[i]);
      }
      return value.toString();
    };

    let offset = 0;

    // Decode _pA (pi_a[0], pi_a[1])
    const pi_a = [
      bytes32ToBigInt(encodedProof.slice(offset, offset + 32)),
      bytes32ToBigInt(encodedProof.slice(offset + 32, offset + 64)),
      "1"
    ];
    offset += 64;

    // Decode _pB (pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1])
    const pi_b = [
      [
        bytes32ToBigInt(encodedProof.slice(offset, offset + 32)),
        bytes32ToBigInt(encodedProof.slice(offset + 32, offset + 64))
      ],
      [
        bytes32ToBigInt(encodedProof.slice(offset + 64, offset + 96)),
        bytes32ToBigInt(encodedProof.slice(offset + 96, offset + 128))
      ],
      ["1", "0"]
    ];
    offset += 128;

    // Decode _pC (pi_c[0], pi_c[1])
    const pi_c = [
      bytes32ToBigInt(encodedProof.slice(offset, offset + 32)),
      bytes32ToBigInt(encodedProof.slice(offset + 32, offset + 64)),
      "1"
    ];

    return {
      pi_a,
      pi_b,
      pi_c,
      protocol: "groth16",
      curve: "bn128"
    };
  }
}
