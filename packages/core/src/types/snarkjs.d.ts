declare module 'snarkjs' {
  export type NumericString = string | bigint;

  export interface Groth16Proof {
    pi_a: [NumericString, NumericString, NumericString];
    pi_b: [[NumericString, NumericString], [NumericString, NumericString], [NumericString, NumericString]];
    pi_c: [NumericString, NumericString, NumericString];
    protocol: 'groth16';
    curve: string;
  }

  export const groth16: {
    fullProve(input: any, wasmModule: any, zkey: any): Promise<{
      proof: Groth16Proof;
      publicSignals: NumericString[];
    }>;
    verify(vkey: any, publicSignals: NumericString[], proof: Groth16Proof): Promise<boolean>;
  };
  
  export const wtns: {
    calculate(wasmModule: any, input: any): Promise<any>;
  };
} 