import { SelectableDataStream, SelectableProcessor } from "./types";

import { API_PATHS } from "../api-endpoints";
import * as nhsdk from "@nihilium/core";
import axios from "axios";
var apiEndpoint = "https://api.nihilium.io";
//var apiEndpoint = "http://localhost:8080";
export function setApiEndpoint(endpoint: string) {
    apiEndpoint = endpoint;
}

export async function getProcessors(): Promise<SelectableProcessor[]>{
    const response = await fetch(`${apiEndpoint}/${API_PATHS.GET_PROCESSORS}`);
    const data = await response.json();
    return data;
// return [
//     {
//         url: "https://processor1.nihilium.io",
//         is_tor: false,
//         jurisdiction: "US",
//         stake: BigInt(1000000000000000000),
//     },
//     {
//         url: "https://processor2.nihilium.io",
//         is_tor: false,
//         jurisdiction: "US",
//         stake: BigInt(1000000000000000000),
//     },
//     {
//         url: "https://processor3.nihilium.io",
//         is_tor: false,
//         jurisdiction: "US",
//         stake: BigInt(1000000000000000000),
//     },
    
// ]

}

export async function getDatastreams(): Promise<SelectableDataStream[]>{
    const response = await fetch(`${apiEndpoint}/${API_PATHS.GET_DATA_STREAMS}`);
    const data = await response.json();
    return data;
    // return [
    //     {
    //         url: "https://datastream1.nihilium.io",
    //         is_tor: false,
    //         jurisdiction: "US",
    //         stake: BigInt(1000000000000000000),
    //     },
    //     {
    //         url: "https://datastream2.nihilium.io",
    //         is_tor: false,
    //         jurisdiction: "US",
    //         stake: BigInt(1000000000000000000),
    //     },
    //     {
    //         url: "https://datastream3.nihilium.io",
    //         is_tor: false,
    //         jurisdiction: "US",
    //         stake: BigInt(1000000000000000000),
    //     },
        
        
    // ]
}


export async function getProcessorEndpoint(url:string) {
    const response = await axios.get(url + "/get_public_keys");
    const data = response.data;
    const addsPubKey = [data.signing_public_key[0], data.signing_public_key[1]];
    const he_encryption = [data.he_public_key[0], data.he_public_key[1]]
    return {
        url: url,
        is_tor: false,
        public_verification_key: [BigInt(addsPubKey[0]), BigInt(addsPubKey[1])] as [bigint, bigint],
        public_he_encryption_key: [BigInt(he_encryption[0]), BigInt(he_encryption[1])] as [bigint, bigint],
        server_address: "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
}

export async function getFullDatastreams(): Promise<nhsdk.DataStreamClient[]> {
    const dataStreams = await getDatastreams();
    return dataStreams.map(dataStream => new nhsdk.DataStreamClient(dataStream.url));
}
export async function getFullProcessors(): Promise<nhsdk.protocolTypes.ProcessorEndpoint[]> {
    const processors = await getProcessors();
    return Promise.all(processors.map(async processor => await getProcessorEndpoint(processor.url)));
}