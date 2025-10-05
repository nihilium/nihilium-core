import { InputMap } from '@noir-lang/noir_js';
import type { CircuitConfig, CircuitWrapper, ProofOptions } from './types/circuit_wrapper';
export declare class WrappedNoirCircuit<T extends InputMap> implements CircuitWrapper<T> {
    private circuit_json;
    private noir;
    private barretenberg;
    private id;
    resolvedCircuitPath: string;
    constructor(json_circuit_path: string | object);
    get_id(): string;
    init(): Promise<void>;
    generateProof(options: ProofOptions<T>): Promise<{
        proof: Uint8Array;
        publicSignals: string[];
    }>;
    verifyProof(zkProof: {
        proof: Uint8Array;
        publicSignals: string[];
    }): Promise<boolean>;
    private parseSignals;
}
export { CircuitConfig };
