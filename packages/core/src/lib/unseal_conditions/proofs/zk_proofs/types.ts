



export interface ChainableProofDefinition<T> {
    get_id(): string;
    get_description(): string;
    get_inputs(): CircuitInput[];
    get_input_index(name: string): [number, number];
    get_output_index(name: string): [number, number];
    get_outputs(): CircuitOutput[];
    get_suggested_chained_inputs(): ChainedInputSuggestion[];
    create_proof(input: T): Promise<any>;
    verify_proof(proof: any, public_signals: any[]): Promise<boolean>;
    verify_onchain_proof(proof: any, public_signals: any[]): Promise<boolean>;
}

export type CircuitInput = {
    name: string;
    index_range: [number, number]; //[Start index, length]
    type: 'Field' | 'Array'

};
export type ChainedInputSuggestion = {
    circuit_id: string;
    source_index: number;
    source_name: string;
    target_index: number;
    target_name: string;
};
export type CircuitOutput = {
    name: string;
    index_range: [number, number]; //[Start index, length]
    type: 'Field' | 'Array'
};

export enum ProofMode {
    FULL_PROOF = "full_proof",
    CREATE_REVEAL_ROOT = "create_reveal_root",
}