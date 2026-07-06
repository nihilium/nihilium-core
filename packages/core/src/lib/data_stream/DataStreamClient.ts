
import { HexString, PROTOCOL_DATA_STREAM_PATHS } from "../../types/protocol/common";
import { ProofPath } from 'fixed-merkle-tree'
import { IDualDataStream, DualProofResult, DualLatestGlobalLeafProofResult } from "./types";

import axios from "axios";



/**
 * HTTP client for a remote dual-tree data stream server.
 */
export class DataStreamClient implements IDualDataStream {
    private endpoint: string;
    private address: string;


    constructor(endpoint: string) {
        this.endpoint = endpoint
        this.address = ""
    }
    hasDataStreamRoot: (root: string) => Promise<boolean> = async (_root: string) => { return false };

    async initialize(): Promise<void> {
        this.address = (await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_ADDRESS).then(res => res.data)).result
    }

    getUrl(): string {
        return this.endpoint
    }

    getAddress(): string {
        return this.address
    }

    async getGlobalTreeIndex(): Promise<number> {
        return axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_GLOBAL_TREE_INDEX).then(res => res.data)
    }

    async isProvable(value: HexString): Promise<boolean> {
        var result = await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.IS_PROVABLE + value)
        return result.data.result
    }

    async postData(data: HexString[]): Promise<[number, number, string]> {
        return axios.post(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.POST_DATA, { data: data }).then(res => res.data)
    }

    async getProof(value: HexString): Promise<DualProofResult> {
        const result = await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_PROOF + value).then(res => res.data)
        result.dualProof.pathElements   = result.dualProof.pathElements.map((e: any) => BigInt(e))
        result.dualProof.pathIndices    = (result.dualProof.pathIndices ?? []).map((e: any) => BigInt(e))
        result.globalProof.pathElements = result.globalProof.pathElements.map((e: any) => BigInt(e))
        result.globalProof.pathIndices  = (result.globalProof.pathIndices ?? []).map((e: any) => BigInt(e))
        result.localProof.pathElements  = result.localProof.pathElements.map((e: any) => BigInt(e))
        result.localProof.pathIndices   = (result.localProof.pathIndices ?? []).map((e: any) => BigInt(e))
        return {
            dualProof:     result.dualProof as ProofPath,
            globalProof:   result.globalProof as ProofPath,
            localProof:    result.localProof as ProofPath,
            timestamp:     parseInt(result.timestamp).toString(),
            globalIndex:   parseInt(result.globalIndex),
            localIndex:    parseInt(result.localIndex),
            blockHash:     result.blockHash as string,
            dualLeafValue: result.dualLeafValue as string,
        }
    }

    async getLatestGlobalLeafProof(): Promise<DualLatestGlobalLeafProofResult> {
        const result = await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_LATEST_GLOBAL_LEAF_PROOF).then(res => res.data)
        result.dualProof.pathElements   = result.dualProof.pathElements.map((e: any) => BigInt(e))
        result.dualProof.pathIndices    = (result.dualProof.pathIndices ?? []).map((e: any) => BigInt(e))
        result.globalProof.pathElements = result.globalProof.pathElements.map((e: any) => BigInt(e))
        result.globalProof.pathIndices  = (result.globalProof.pathIndices ?? []).map((e: any) => BigInt(e))
        return {
            dualProof:   result.dualProof as ProofPath,
            globalProof: result.globalProof as ProofPath,
            leafRoot:    result.leafRoot as string,
            timestamp:   parseInt(result.timestamp).toString(),
            globalIndex: parseInt(result.globalIndex),
            blockHash:   result.blockHash as string,
        }
    }

}
