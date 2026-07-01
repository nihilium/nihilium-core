import MerkleTree, { ProofPath } from "fixed-merkle-tree";
import { HexString } from "../../types/protocol/common";


/*
DataStream interface to be run by the datastream server and as implemented by the client



*/
/**
 * Extended interface for data streams backed by the dual Merkle tree.
 * getProof and getLatestGlobalLeafProof include a proof path in the dual tree.
 */
export interface IDualDataStream extends Omit<IDataStream, 'getProof' | 'getLatestGlobalLeafProof'> {
    // Returns [dualProof, globalProof, localProof, timestamp, globalIndex, localIndex, blockHash]
    getProof(value: HexString): Promise<[ProofPath, ProofPath, ProofPath, number, number, number, string]>;
    // Returns [dualProof, globalProof, leafRoot, timestamp, globalIndex, blockHash]
    getLatestGlobalLeafProof(): Promise<[ProofPath, ProofPath, string, number, number, string]>;
}

export interface IDataStream {
    initialize: () => Promise<void>;    
    getAddress: () => string;
    getUrl: () => string;
    // Returns [globalProof, leafRoot, timestamp, globalIndex, blockHash]
    getLatestGlobalLeafProof: () => Promise<[ProofPath, string, number, number, string]>;
    postData: (data: HexString[]) => Promise<[number, number, string]>;
    // Returns [globalProof, localProof, timestamp, globalIndex, localIndex, blockHash]
    getProof: (value: HexString) => Promise<[ProofPath, ProofPath, number, number, number, string]>;
    hasDataStreamRoot: (root: string) => Promise<boolean>;
    hasValueRoot: (root: string) => Promise<boolean>;
    isProvable:(value: HexString) => Promise<boolean>;
}
