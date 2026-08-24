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
    timestamp: string;
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

/**
 * A value may be published to the stream more than once, so a proof has to name WHICH publication it
 * is built from. `from` is a lower bound on the anchoring block timestamp (unix seconds): the
 * earliest occurrence anchored at or after it is selected. Omitting it (or 0) means "the earliest
 * occurrence", which is the safe default — a third party republishing someone else's value can never
 * move an unpinned proof forward onto a later round.
 */
export interface IDataStream {
    initialize: () => Promise<void>;
    getAddress: () => string;
    getUrl: () => string;
    getLatestGlobalLeafProof: () => Promise<LatestGlobalLeafProofResult>;
    postData: (data: HexString[]) => Promise<[number, number, string]>;
    getProof: (value: HexString, from?: number) => Promise<ProofResult>;
    hasDataStreamRoot: (root: string) => Promise<boolean>;
    isProvable: (value: HexString, from?: number) => Promise<boolean>;
}

export interface IDualDataStream extends Omit<IDataStream, 'getProof' | 'getLatestGlobalLeafProof'> {
    getProof(value: HexString, from?: number): Promise<DualProofResult>;
    getLatestGlobalLeafProof(): Promise<DualLatestGlobalLeafProofResult>;
}
