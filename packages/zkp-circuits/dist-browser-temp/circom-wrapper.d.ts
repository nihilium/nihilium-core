import type { CircuitConfigCircom, CircuitWrapper, ProofOptions } from './types/circuit_wrapper';
export interface IPFSConfig {
    gateway: string;
    circuitName: string;
    files: {
        'verifier.sol': string;
        'vkey.json': string;
        'zkey.zkey': string;
        'wasm.wasm': string;
    };
}
export declare class WrappedCircomCircuit implements CircuitWrapper<any> {
    private config;
    private wasmModule;
    private zkey;
    private vkey;
    private snarkjs;
    private signals;
    resolvedWasmPath: string;
    resolvedZkeyPath: string;
    resolvedVkeyPath: string;
    resolvedSignalsPath: string;
    environment: 'node' | 'browser';
    id: string;
    private static cacheDir;
    constructor(config: CircuitConfigCircom);
    /**
     * Create a WrappedCircomCircuit from IPFS configuration.
     * @param ipfsConfig IPFS configuration with gateway URL and file hashes
     * @returns Configured WrappedCircomCircuit instance
     */
    static fromIPFS(ipfsConfig: IPFSConfig): WrappedCircomCircuit;
    /**
     * Download a file from IPFS and cache it locally (Node.js only)
     * @param url IPFS URL to download
     * @param filename Local filename to save as
     * @returns Local file path
     */
    private static downloadIPFSFile;
    /**
     * Resolve IPFS URLs to local paths (Node.js) or keep as URLs (browser)
     * @param ipfsUrl IPFS URL
     * @param filename Local filename for caching
     * @returns Resolved path (local file path in Node.js, URL in browser)
     */
    private static resolveIPFSPath;
    get_id(): string;
    /**
     * Initialize the circuit and resolve artifact URLs/paths.
     * For IPFS URLs, downloads files locally in Node.js or uses URLs directly in browser.
     * Example:
     *   wasmPath: 'https://ipfs.io/ipfs/QmXxx...' (IPFS URL)
     *   zkeyPath: 'https://ipfs.io/ipfs/QmYyy...' (IPFS URL)
     *   vkeyPath: 'https://ipfs.io/ipfs/QmZzz...' (IPFS URL)
     */
    init(): Promise<void>;
    /**
     * Generate a zero-knowledge proof for the given inputs.
     * Returns the proof object and public signals.
     * Use encodeProofForContract() to convert the proof to bytes for smart contract verification.
     */
    generateProof(options: ProofOptions<any>): Promise<{
        rawProof?: any;
        circomProof?: any;
        proof: any;
        publicSignals: string[];
    }>;
    /**
     * Format circom proof object with Solidity-compatible hex strings.
     * Converts all numeric strings to 0x-prefixed hex format.
     */
    private formatProofForSolidity;
    fieldToIndex(field: string): number;
    indexToField(index: number): string;
    /**
     * Verify a zero-knowledge proof locally using the verification key.
     * @param zkProof The proof object and public signals from generateProof()
     *                Can accept either hex-formatted or decimal string format
     */
    verifyProof(zkProof: {
        proof: any;
        publicSignals: string[];
    }): Promise<boolean>;
    /**
     * Convert hex-formatted proof back to decimal strings for snarkjs.
     */
    private hexProofToDecimal;
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
    encodeProofForContract(proof: any): Uint8Array;
    /**
     * Decode proof from smart contract format back to circom format.
     * Converts a 256-byte Uint8Array (from smart contract) back into the original
     * circom proof object structure.
     *
     * @param encodedProof 256-byte Uint8Array in the format: abi.encodePacked(uint[2] _pA, uint[2][2] _pB, uint[2] _pC)
     * @returns Proof object with pi_a, pi_b, pi_c fields
     */
    decodeProofFromContract(encodedProof: Uint8Array): any;
}
