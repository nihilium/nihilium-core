import { InputMap } from "@noir-lang/noir_js";

export interface CircuitConfig {
  
  environment: 'node' | 'browser';
}

export interface CircuitConfigCircom {
  name: string;
  wasmPath: string;
  zkeyPath: string;
  vkeyPath?: string;
  signalsPath?: string;
  publicInputs?: string[];
  publicOutputs?: string[];
}


export interface CircuitOutput {
  [key: string]: bigint | bigint[];
}

export interface ProofOptions<T> {
  input: T;
}

export interface VerifyOptions {
  proof: Uint8Array;
  publicSignals: string[];
}

export interface CircuitWrapper<T extends InputMap> {
  get_id(): string;
  init(): Promise<void>;
  generateProof(options: ProofOptions<T>): Promise<{
    proof: Uint8Array;
    publicSignals: string[];
   
  }>;
  verifyProof(options: VerifyOptions): Promise<boolean>;
} 