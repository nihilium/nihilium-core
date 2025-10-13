import { NihiliumAPI, API_PATHS } from "./nihiliumapi";


export class DevSDKAPIClient extends NihiliumAPI {
    
    private apiKey: string;
    
    constructor(endpoint: string, apiKey: string) {
        super(endpoint);
        this.apiKey = apiKey;
        this.processorTokenRequest = this.exampleProcessorTokenRequest;
        this.dataStreamTokenRequest = this.exampleDataStreamTokenRequest;
        
        
    }

    
 async exampleProcessorTokenRequest(processorId: string, requestId: string) {
    const response = await fetch(`${this.endpoint}/${API_PATHS.GET_PROCESSOR_TOKEN}`, {
        method: "POST",
        body: JSON.stringify({processorId, requestId}),
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey
        }
    });
    return response.json();
}


 async exampleDataStreamTokenRequest(dataStreamId: string, requestId: string) {
    const response = await fetch(`${this.endpoint}/${API_PATHS.GET_DATA_STREAM_TOKEN}`, {
        method: "POST",
        body: JSON.stringify({dataStreamId, requestId}),
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey
        }
    });
    return response.json();
}
}