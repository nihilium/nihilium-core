/**
 * The shared client surface, identical in every environment.
 *
 * Mirrors the layout @nihilium/core and @nihilium/zkp-circuits already use: this file holds
 * everything common, and the per-environment entries (`index.ts` for the browser, `index.node.ts`
 * for Node) re-export it and add only what actually differs.
 *
 * Nothing here branches on the runtime, and nothing here should. What differs between the two
 * builds is *resolution*, not source: the browser build resolves `@nihilium/core` and `snarkjs` to
 * their browser entries, the Node build to their node entries. See vite.config.mjs and
 * vite.config.node.mjs.
 */
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

// Use-case-focused seal/unseal scenarios (built on @nihilium/core's client mechanism).
// The canonical import path is the subpath -- `@nihilium/client-sdk/scenarios/zkemail`. Re-exported
// here for compatibility; `export *` (rather than a name list) so the root cannot drift from the barrel.
export * from './scenarios/zkemail';

export const cryptoTools = nhsdk.cryptoTools;

// export const devProcessorUrl:string = "https://processor1.nihilium.io";
// export const devDataStreamUrl:string = "https://datastream1.nihilium.io";


export async function check_if_reveal_value_is_published(datastream_url: string, reveal_value: bigint) {
    const dataStream = new nhsdk.DataStreamClient(datastream_url);
    await dataStream.initialize();
    const isProvable = await dataStream.isProvable(reveal_value.toString());
    return isProvable;
}

/**
 * Convenience: a default k-of-n threshold sealing client using the reveal-only template and the
 * registry's default processors/datastream. Selects `processorCount` (default = threshold)
 * processors. Not started — call `start_sealing(metadataRoot)` on the returned client, which
 * generates the vault keypair and returns the seal carrying its public half.
 */
export async function getDefaultSealingClient(opts: {
    threshold: number;
    processorCount?: number;
    searchWidth?: number;
    chainId?: number;
}): Promise<nhsdk.NihiliumSealingClient> {
    const chainId = opts.chainId ?? nhsdk.NETWORK_IDS.ANVIL;
    const count = opts.processorCount ?? opts.threshold;
    if (count < opts.threshold) {
        throw new Error(`processorCount (${count}) must be >= threshold (${opts.threshold})`);
    }

    const dataStreams = await getDatastreams();
    const resolvedDataStream = new nhsdk.DataStreamClient(dataStreams[0].url);
    await resolvedDataStream.initialize();

    const processors = await getProcessors();
    const resolvedProcessors = await Promise.all(
        processors.slice(0, count).map((p) => getProcessorEndpoint(p)),
    );

    const proofCollection = nhsdk.createRevealOnlyCollection(chainId);
    return new nhsdk.NihiliumSealingClient(
        resolvedProcessors,
        [resolvedDataStream],
        proofCollection.template,
        opts.threshold,
        undefined,
        undefined,
        opts.searchWidth,
    );
}

/**
 * Convenience: a threshold unsealing client for a stored NihiliumSeal, resolving the processors and
 * datastreams recorded in the seal. Not started — call `start_unsealing([...k indices])`.
 */
export async function getDefaultUnsealingClient(
    seal: nhsdk.types.NihiliumSeal,
    chainId: number = nhsdk.NETWORK_IDS.ANVIL,
): Promise<nhsdk.NihiliumUnsealingClient> {
    const processors = await Promise.all(
        seal.packages.map((pkg) =>
            getProcessorEndpoint({
                url: pkg.public_package.processor_url,
                name: "Processor",
                ethAddress: "0x0000000000000000000000000000000000000000",
                is_tor: false,
                jurisdiction: "US",
                stake: 0n,
            }),
        ),
    );
    const urls = Array.from(
        new Set(seal.packages.flatMap((pkg) => pkg.public_package.data_stream_urls)),
    );
    const dataStreams = urls.map((url) => new nhsdk.DataStreamClient(url));
    await Promise.all(dataStreams.map((d) => d.initialize()));

    const collection = nhsdk.createRevealOnlyCollection(chainId).collection;
    // The default (reveal-only) unseal scenario.
    return new nhsdk.DefaultUnsealingClient(seal, processors, dataStreams, { collection });
}

export async function preload_circuits() {
    await circomOpeningProof.init(true);
    await circomHashTie.init(true);
}

export { nhsdk }