
import { HexString, PROTOCOL_DATA_STREAM_PATHS } from "../../types/protocol/common";
import { ProofPath } from 'fixed-merkle-tree'
import { IDataStream } from "./types";

import axios from "axios";



/**
 * In Memory Data stream for testing purposes
 */
export class DataStreamClient implements IDataStream {
    private endpoint: string;
    private address: string;
   

    constructor(endpoint:string) {
        this.endpoint = endpoint
        this.address = ""
    }
    hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};
    hasValueRoot: (root: string) => Promise<boolean> = async (root: string) => {return false};

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
        return axios.post(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.POST_DATA, {data: data}).then(res => res.data)
    }

    async getProof(value: HexString): Promise<[ProofPath, ProofPath, number, number, number, string]> {
        var result = await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_PROOF + value).then(res => res.data)
        result.globalProof.pathElements = result.globalProof.pathElements.map((element: any) => BigInt(element))
        result.globalProof.pathIndices = result.globalProof.pathIndices.map((element: any) => BigInt(element))
        result.localProof.pathElements = result.localProof.pathElements.map((element: any) => BigInt(element))
        result.localProof.pathIndices = result.localProof.pathIndices.map((element: any) => BigInt(element))
        return [result.globalProof, result.localProof, parseInt(result.timestamp), parseInt(result.globalIndex), parseInt(result.localIndex), result.blockHash as string]
    }

    async getLatestGlobalLeafProof(): Promise<[ProofPath, string, number, number, string]> {
        var result = await axios.get(this.endpoint + PROTOCOL_DATA_STREAM_PATHS.GET_LATEST_GLOBAL_LEAF_PROOF).then(res => res.data)
        result.globalProof.pathElements = result.globalProof.pathElements.map((element: any) => BigInt(element))
        result.globalProof.pathIndices = result.globalProof.pathIndices.map((element: any) => BigInt(element))
        return [result.globalProof as ProofPath, result.leaf as string, parseInt(result.timestamp), parseInt(result.globalIndex), result.blockHash as string]
    }

}
