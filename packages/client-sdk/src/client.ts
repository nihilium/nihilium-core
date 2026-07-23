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
     * Build a sealing process for a template: selects one processor + datastream (by filter)
     * and wires them via the core factory. `payment` is an optional per-operation strategy.
     */
    async sealingProcess(opts: {
        template: nhsdk.types.UnsealConditionTemplate;
        filter?: EndpointFilter;
        payment?: nhsdk.PaymentProvider | null;
    }): Promise<nhsdk.ClientSingleShareSealingProcess> {
        const [processor] = await this.selectProcessors(opts.filter, 1);
        const dataStreams = await this.selectDataStreams(opts.filter, 1);
        return nhsdk.SealingProcess.create({
            processor,
            dataStreams,
            template: opts.template,
            payment: opts.payment ?? null,
        });
    }

    /**
     * Build an unsealing process for a stored seal + collection. Resolves the processor and
     * datastreams recorded in the seal, loads the template from the seal (or uses the one
     * given), and returns an initialized process via the core factory.
     */
    async unsealingProcess(
        seal: nhsdk.types.SingleSealStoragePackage,
        opts: {
            collection: nhsdk.types.UnsealConditionCollection;
            template?: nhsdk.types.UnsealConditionTemplate;
        },
    ): Promise<nhsdk.ClientSingleShareUnsealingProcess> {
        const processor = await getProcessorEndpoint({
            url: seal.public_package.processor_url,
            name: 'Processor',
            ethAddress: '0x0000000000000000000000000000000000000000',
            is_tor: false,
            jurisdiction: 'US',
            stake: 0n,
        });
        const dataStreams = seal.public_package.data_stream_urls.map(
            (url) => new nhsdk.DataStreamClient(url),
        );
        await Promise.all(dataStreams.map((d) => d.initialize()));
        const template =
            opts.template ??
            nhsdk.collection_from_json(
                seal.private_package.unseal_template,
                nhsdk.proofLibrary,
                nhsdk.moduleLibrary,
            );
        return nhsdk.UnsealingProcess.create({
            processor,
            collection: opts.collection,
            template,
            dataStreams,
            seal,
        });
    }
}
