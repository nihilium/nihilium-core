import { SelectableDataStream, SelectableProcessor } from "./types";

import { API_PATHS } from "../api-endpoints";
const apiEndpoint = "https://api.nihilium.io";
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