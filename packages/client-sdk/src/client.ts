import * as nhsdk from '@nihilium/core';
import { getProcessors, getDatastreams, getProcessorEndpoint } from './lib/endpoint-selection';
import type { SelectableProcessor, SelectableDataStream } from './lib/types';

/**
 * Criteria for selecting processors / datastreams from the registry. All fields are
 * optional; omitting them matches everything. Extend as the endpoint gains factors.
 */
export type EndpointFilter = {
    /** Allowed jurisdictions (endpoint must be one of these). */
    jurisdiction?: string | string[];
    /** Excluded jurisdictions. */
    excludeJurisdiction?: string | string[];
    /** Minimum stake the endpoint must hold. */
    minStake?: bigint;
    /** Require (true) or forbid (false) tor endpoints; omit to allow both. */
    tor?: boolean;
    /** Custom predicate for anything not covered above. */
    where?: (endpoint: SelectableProcessor | SelectableDataStream) => boolean;
};

export type NihiliumClientOptions = {
    /** Registry / selection API base url. Defaults to https://api.nihilium.io */
    apiUrl?: string;
    /** Default network id for collections/contracts. Defaults to NETWORK_IDS.ANVIL */
    network?: number;
};

function toList(v?: string | string[]): string[] | undefined {
    if (v === undefined) return undefined;
    return Array.isArray(v) ? v : [v];
}

function matches(endpoint: SelectableProcessor | SelectableDataStream, filter: EndpointFilter): boolean {
    const allow = toList(filter.jurisdiction);
    if (allow && !allow.includes(endpoint.jurisdiction)) return false;
    const deny = toList(filter.excludeJurisdiction);
    if (deny && deny.includes(endpoint.jurisdiction)) return false;
    if (filter.minStake !== undefined && endpoint.stake < filter.minStake) return false;
    if (filter.tor !== undefined && endpoint.is_tor !== filter.tor) return false;
    if (filter.where && !filter.where(endpoint)) return false;
    return true;
}

/**
 * Configured entry point to the protocol. Holds the registry endpoint + network, selects
 * processors/datastreams by filter, and assembles sealing/unsealing processes.
 * Authorization/payment is a per-operation strategy, never held on the client.
 */
export class NihiliumClient {
    readonly apiUrl: string;
    readonly network: number;

    constructor(options: NihiliumClientOptions = {}) {
        this.apiUrl = options.apiUrl ?? 'https://api.nihilium.io';
        this.network = options.network ?? nhsdk.NETWORK_IDS.ANVIL;
    }

    /** Select up to `count` processors matching `filter`, resolved to ProcessorEndpoints. */
    async selectProcessors(filter: EndpointFilter = {}, count: number = 1): Promise<nhsdk.types.ProcessorEndpoint[]> {
        const all = await getProcessors(this.apiUrl);
        const chosen = all.filter((p) => matches(p, filter)).slice(0, count);
        return Promise.all(chosen.map((p) => getProcessorEndpoint(p)));
    }

    /** Select up to `count` datastreams matching `filter`, returned as initialized clients. */
    async selectDataStreams(filter: EndpointFilter = {}, count: number = 1): Promise<nhsdk.DataStreamClient[]> {
        const all = await getDatastreams(this.apiUrl);
        const chosen = all.filter((d) => matches(d, filter)).slice(0, count);
        const clients = chosen.map((d) => new nhsdk.DataStreamClient(d.url));
        await Promise.all(clients.map((c) => c.initialize()));
        return clients;
    }

    /**
     * Build a k-of-n threshold sealing client for a template: selects `processorCount` (default k)
     * processors + one datastream (by filter) and wires them into a NihiliumSealingClient. The
     * returned client is not started — call `start_sealing(metadataRoot)` to produce the
     * NihiliumSeal. `payment` is an optional per-operation strategy for authorized processors.
     */
    async sealingClient(opts: {
        template: nhsdk.types.UnsealConditionTemplate;
        threshold: number;
        processorCount?: number;
        searchWidth?: number;
        filter?: EndpointFilter;
        payment?: nhsdk.PaymentProvider;
        encryptionMode?: nhsdk.NihiliumEncryptionMode;
    }): Promise<nhsdk.NihiliumSealingClient> {
        const count = opts.processorCount ?? opts.threshold;
        if (count < opts.threshold) {
            throw new Error(`processorCount (${count}) must be >= threshold (${opts.threshold})`);
        }
        const processors = await this.selectProcessors(opts.filter, count);
        const [dataStream] = await this.selectDataStreams(opts.filter, 1);
        return new nhsdk.NihiliumSealingClient(
            processors,
            [dataStream],
            opts.template,
            opts.threshold,
            opts.payment,
            opts.encryptionMode,
            opts.searchWidth,
        );
    }

    /**
     * Build a threshold unsealing client for a stored NihiliumSeal. Resolves the processor for each
     * of the seal's packages (in package order, since the unseal client maps packages[i] ->
     * processors[i]) and the datastreams recorded in the seal. The returned client is not started —
     * call `start_unsealing([...k processor indices])` to recover the secret. Unsealing is unpaid.
     */
    async unsealingClient(
        seal: nhsdk.types.NihiliumSeal,
        opts: { collection?: nhsdk.types.UnsealConditionCollection } = {},
    ): Promise<nhsdk.NihiliumUnsealingClient> {
        const processors = await Promise.all(
            seal.packages.map((pkg) =>
                getProcessorEndpoint({
                    url: pkg.public_package.processor_url,
                    name: 'Processor',
                    // Unseal is unpaid, so server_address is unused — a placeholder is fine.
                    ethAddress: '0x0000000000000000000000000000000000000000',
                    is_tor: false,
                    jurisdiction: 'US',
                    stake: 0n,
                }),
            ),
        );
        const urls = Array.from(
            new Set(seal.packages.flatMap((pkg) => pkg.public_package.data_stream_urls)),
        );
        const dataStreams = urls.map((url) => new nhsdk.DataStreamClient(url));
        await Promise.all(dataStreams.map((d) => d.initialize()));
        // The default (reveal-only) unseal scenario. For scenario-specific proving (e.g. ZKEmail),
        // construct the corresponding subclass (nhsdk.ZKEmailUnsealingClient) directly.
        return new nhsdk.DefaultUnsealingClient(seal, processors, dataStreams, {
            collection: opts.collection,
        });
    }
}
