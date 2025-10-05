import { SelectableDataStream, SelectableProcessor } from "./types";



export async function getProcessors(): Promise<SelectableProcessor[]>{
return [
    {
        url: "https://processor1.nihilium.io",
        is_tor: false,
        jurisdiction: "US",
        stake: BigInt(1000000000000000000),
    },
    {
        url: "https://processor2.nihilium.io",
        is_tor: false,
        jurisdiction: "US",
        stake: BigInt(1000000000000000000),
    },
    {
        url: "https://processor3.nihilium.io",
        is_tor: false,
        jurisdiction: "US",
        stake: BigInt(1000000000000000000),
    },
    
]

}

export async function getDatastreams(): Promise<SelectableDataStream[]>{
    return [
        {
            url: "https://datastream1.nihilium.io",
            is_tor: false,
            jurisdiction: "US",
            stake: BigInt(1000000000000000000),
        },
        {
            url: "https://datastream2.nihilium.io",
            is_tor: false,
            jurisdiction: "US",
            stake: BigInt(1000000000000000000),
        },
        {
            url: "https://datastream3.nihilium.io",
            is_tor: false,
            jurisdiction: "US",
            stake: BigInt(1000000000000000000),
        },
        
        
    ]
}