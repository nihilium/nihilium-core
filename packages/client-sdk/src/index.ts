// Example: re-export browser entry from privacy-lib
import * as nhsdk from '@nihilium/privacy-lib'; 
import axios from "axios";
import { SelectableDataStream, SelectableProcessor,  } from "./lib/types";
import { getDatastreams, getProcessors } from './lib/endpoint-selection';

export type SingleSealStoragePackage = nhsdk.ProtocolTypes.SingleSealStoragePackage;


export const cryptoTools = nhsdk.cryptoTools;
// export const devProcessorUrl:string = "https://processor1.nihilium.io";
// export const devDataStreamUrl:string = "https://datastream1.nihilium.io";


export async function check_if_reveal_value_is_published(datastream_url: string, reveal_value: bigint) {
    const dataStream = new nhsdk.DataStreamClient(datastream_url);
    await dataStream.initialize();
    const isProvable = await dataStream.isProvable(reveal_value.toString());
    return isProvable;
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

export async function getSealingProcessing(
    processorEndpoint: SelectableProcessor,
    dataStream: SelectableDataStream,
    chainedProofCollection:nhsdk.ChainedProofCollection) {
    const resolvedProcessorEndpoint = await getProcessorEndpoint(processorEndpoint.url);
    const resolvedDataStream = new nhsdk.DataStreamClient(dataStream.url);
    
    const proofCollection = chainedProofCollection;
    const sealingProcess = new nhsdk.ClientSingleShareSealingProcess(
        resolvedProcessorEndpoint,
        proofCollection);
    return sealingProcess;
}

export async function getDefaultSealingProcess() {
   var dataStreams = await getDatastreams();
   var dataStream = dataStreams[0];
   const resolvedDataStream = new nhsdk.DataStreamClient(dataStream.url);
   await resolvedDataStream.initialize();
   var processorEndpoints = await getProcessors();
   var processorEndpoint = processorEndpoints[0];
   const resolvedProcessorEndpoint = await getProcessorEndpoint(processorEndpoint.url);
   const genanche = nhsdk.deployedProtocolContracts[nhsdk.NETWORK_IDS.AVAX_TESTNET];
    const proofCollection = new nhsdk.ProofCollections["reveal_only_normal_trees"](
        genanche.opening_proof.address,
        genanche.TopLevelMerkleProof.address,
        genanche.SubTreeMerkleProof.address,
        [resolvedDataStream])

    const sealingProcess = new nhsdk.ClientSingleShareSealingProcess(
        resolvedProcessorEndpoint, 
        proofCollection);
    return sealingProcess;
}

export async function getDefaultUnsealingProcess(seal: nhsdk.ProtocolTypes.SingleSealStoragePackage) {
    
    const processorEndpoint = await getProcessorEndpoint(seal.public_package.processor_url);
    const dataStream = new nhsdk.DataStreamClient(seal.public_package.data_stream_urls[0]);
    await dataStream.initialize();
    const revealCollectionInputs = seal.private_package.reveal_collection_inputs;
    const proofCollectionClass = nhsdk.ProofCollections[seal.private_package.reveal_collection_id];
    // Spread the fields of reveal_collection_inputs as constructor arguments, then add [dataStream] as the last argument
    const proofCollection = new proofCollectionClass(
        ...Object.values(revealCollectionInputs),
        [dataStream]
    );
    var unsealingProcess = new nhsdk.ClientSingleShareUnsealingProcess(
        processorEndpoint, proofCollection, seal);
    return unsealingProcess;
}

export { nhsdk }