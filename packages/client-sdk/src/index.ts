// Example: re-export browser entry from privacy-lib
import * as nhsdk from '@nihilium/core';
export * from '@nihilium/core';
import { getDatastreams, getProcessors, getProcessorEndpoint } from './lib/endpoint-selection';
import { circomHashTie, circomOpeningProof } from '@nihilium/zkp-circuits';
export type SingleSealStoragePackage = nhsdk.types.SingleSealStoragePackage;
export { getFullDatastreams, getFullProcessors } from './lib/endpoint-selection';
export { getProcessorEndpoint, setApiEndpoint } from './lib/endpoint-selection';
// Configured client (instance config, filtered selection, high-level seal/unseal).
export { NihiliumClient } from './client';
export type { EndpointFilter, NihiliumClientOptions } from './client';

export const cryptoTools = nhsdk.cryptoTools;

// export const devProcessorUrl:string = "https://processor1.nihilium.io";
// export const devDataStreamUrl:string = "https://datastream1.nihilium.io";


export async function check_if_reveal_value_is_published(datastream_url: string, reveal_value: bigint) {
    const dataStream = new nhsdk.DataStreamClient(datastream_url);
    await dataStream.initialize();
    const isProvable = await dataStream.isProvable(reveal_value.toString());
    return isProvable;
}



// export async function getSealingProcessing(
//     processorEndpoint: SelectableProcessor,
//     dataStream: SelectableDataStream,
//     chainedProofCollection:nhsdk.ChainedProofCollection) {
//     const resolvedProcessorEndpoint = await getProcessorEndpoint(processorEndpoint.url);
//     const resolvedDataStream = new nhsdk.DataStreamClient(dataStream.url);
    
//     const proofCollection = chainedProofCollection;
//     const sealingProcess = new nhsdk.ClientSingleShareSealingProcess(
//         resolvedProcessorEndpoint,
//         proofCollection);
//     return sealingProcess;
// }

export async function getDefaultSealingProcess(chainId: number = nhsdk.NETWORK_IDS.ANVIL) {
   var dataStreams = await getDatastreams();
   var dataStream = dataStreams[0];
   const resolvedDataStream = new nhsdk.DataStreamClient(dataStream.url);
   await resolvedDataStream.initialize();
   var processorEndpoints = await getProcessors();
   var processorEndpoint = processorEndpoints[0];
   const resolvedProcessorEndpoint = await getProcessorEndpoint(processorEndpoint);
   const genanche = nhsdk.deployedProtocolContracts[chainId];
   const proofCollection = nhsdk.createRevealOnlyCollection(chainId);
     
    
        

    const sealingProcess = new nhsdk.ClientSingleShareSealingProcess(resolvedProcessorEndpoint, 
        [resolvedDataStream], proofCollection.template);
         
        
    return sealingProcess;
}

export async function getDefaultUnsealingProcess(seal: nhsdk.types.SingleSealStoragePackage,
    chainId: number = nhsdk.NETWORK_IDS.ANVIL
) {
    
    const processorEndpoint = await getProcessorEndpoint({url: seal.public_package.processor_url, name: "Processor", ethAddress: "0x0000000000000000000000000000000000000000", is_tor: false, jurisdiction: "US", stake: BigInt(1000000000000000000)});
    const dataStream = new nhsdk.DataStreamClient(seal.public_package.data_stream_urls[0]);
    await dataStream.initialize();
    
    const proofCollectionClass = nhsdk.createRevealOnlyCollection(chainId)
    // Spread the fields of reveal_collection_inputs as constructor arguments, then add [dataStream] as the last argument
    proofCollectionClass.template = nhsdk.collection_from_json(seal.private_package.unseal_template,
        nhsdk.proofLibrary, nhsdk.moduleLibrary);
    var unsealingProcess = new nhsdk.ClientSingleShareUnsealingProcess(
        processorEndpoint, proofCollectionClass.collection, proofCollectionClass.template,
         {[dataStream.getAddress()]: dataStream}, seal);
    return unsealingProcess;
}

export async function preload_circuits() {
    await circomOpeningProof.init(true);
    await circomHashTie.init(true);
}

export { nhsdk }