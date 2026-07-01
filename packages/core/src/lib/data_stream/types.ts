import MerkleTree, { ProofPath } from "fixed-merkle-tree";
import { HexString } from "../../types/protocol/common";

export interface ProofResult {
    globalProof: ProofPath;
    localProof: ProofPath;
    timestamp: number;
    globalIndex: number;
    localIndex: number;
    blockHash: string;
}

export interface LatestGlobalLeafProofResult {
    globalProof: ProofPath;
    leafRoot: string;
    timestamp: number;
    globalIndex: number;
    blockHash: string;
}

export interface DualProofResult {
    dualProof: ProofPath;
    globalProof: ProofPath;
    localProof: ProofPath;
    timestamp: number;
    globalIndex: number;
    localIndex: number;
    blockHash: string;
    dualLeafValue: string;
}

export interface DualLatestGlobalLeafProofResult {
    dualProof: ProofPath;
    globalProof: ProofPath;
    leafRoot: string;
    timestamp: string;
    globalIndex: number;
    blockHash: string;
}

export interface IDataStream {
    initialize: () => Promise<void>;
    getAddress: () => string;
    getUrl: () => string;
    getLatestGlobalLeafProof: () => Promise<LatestGlobalLeafProofResult>;
    postData: (data: HexString[]) => Promise<[number, number, string]>;
    getProof: (value: HexString) => Promise<ProofResult>;
    hasDataStreamRoot: (root: string) => Promise<boolean>;
    isProvable: (value: HexString) => Promise<boolean>;
}

export interface IDualDataStream extends Omit<IDataStream, 'getProof' | 'getLatestGlobalLeafProof'> {
    getProof(value: HexString): Promise<DualProofResult>;
    getLatestGlobalLeafProof(): Promise<DualLatestGlobalLeafProofResult>;
}
