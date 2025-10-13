import { SelectableDataStream, SelectableProcessor } from "./types";

export const API_PATHS = {
    GET_PROCESSORS: "api/get-processors",
    GET_DATA_STREAMS: "api/get-datastreams",
    GET_PROCESSOR_TOKEN: "api/get-processor-token",
    GET_DATA_STREAM_TOKEN: "api/get-datastream-token"
}


export async function exampleProcessorTokenRequest(endpoint: string, processorId: string, requestId: string) {
    const response = await fetch(`${endpoint}/${API_PATHS.GET_PROCESSOR_TOKEN}`, {
        method: "POST",
        body: JSON.stringify({processorId, requestId}),
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": `user-key`
        }
    });
    return response.json();
}


export async function exampleDataStreamTokenRequest(endpoint: string, dataStreamId: string, requestId: string) {
    const response = await fetch(`${endpoint}/${API_PATHS.GET_DATA_STREAM_TOKEN}`, {
        method: "POST",
        body: JSON.stringify({dataStreamId, requestId}),
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": `user-key`
        }
    });
    return response.json();
}


export class NihiliumAPI {
    protected endpoint: string;
    protected processorTokenRequest: (processorId: string, requestId: string) => Promise<string>;
    protected dataStreamTokenRequest: (dataStreamId: string, requestId: string) => Promise<string>;
    constructor(endpoint: string, 
        processorTokenRequest?: (processorId: string, requestId: string) => Promise<string>,
        dataStreamTokenRequest?: (dataStreamId: string, requestId: string) => Promise<string>) {
        this.endpoint = endpoint;
        this.processorTokenRequest = processorTokenRequest || (async (processorId: string, requestId: string) => {return await exampleProcessorTokenRequest(this.endpoint, processorId, requestId)});
        this.dataStreamTokenRequest = dataStreamTokenRequest || (async (dataStreamId: string, requestId: string) => {return await exampleDataStreamTokenRequest(this.endpoint, dataStreamId, requestId)});
    }

    


    async getProcessors(): Promise<SelectableProcessor[]> {
        const response = await fetch(`${this.endpoint}/${API_PATHS.GET_PROCESSORS}`);
        return response.json();
    }

    async getDatastreams(): Promise<SelectableDataStream[]> {
        const response = await fetch(`${this.endpoint}/${API_PATHS.GET_DATA_STREAMS}`);
        return response.json();
    }

    async getProcessorToken(processorId: string, requestId: string) {
        return await this.processorTokenRequest(processorId, requestId);
    }

    async getDataStreamToken(dataStreamId: string, requestId: string) {
        return await this.dataStreamTokenRequest(dataStreamId, requestId);
    }

}