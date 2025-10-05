import MerkleTree, { ProofPath } from "fixed-merkle-tree";
import { HexString } from "../../types/protocol/common";


/*
DataStream interface to be run by the datastream server and as implemented by the client



*/
export interface IDataStream {
    initialize: () => Promise<void>;    
    getAddress: () => string;
    getUrl: () => string;
    getLatestGlobalLeafProof: () => Promise<[ProofPath, string, number, number]>;
    postData: (data: HexString[]) => Promise<[number, number]>;
    getProof: (value: HexString) => Promise<[ProofPath, ProofPath, number, number, number]>;
    hasDataStreamRoot: (root: string) => Promise<boolean>;
    hasValueRoot: (root: string) => Promise<boolean>;
    isProvable:(value: HexString) => Promise<boolean>;
}
