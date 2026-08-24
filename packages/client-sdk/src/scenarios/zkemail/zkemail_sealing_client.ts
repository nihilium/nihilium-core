import * as nhsdk from "@nihilium/core";
import { getFullDatastreams, getFullProcessors } from "../../lib/endpoint-selection";
import { hashEmailAddress } from "./email_hash";
import collectionJson from "./zk-email-full.json";

/** The datastream input the opening module's anchoring proof is validated against. */
const DATA_STREAM_ID = "datastream";
const OPENING_MODULE_NODE_ID = "UnsealOpeningModule_0";

export type ZKEmailSealingOptions = {
    /** The recovery email address. Its hash is compiled into the unseal conditions. */
    email: string;
    /**
     * Base URL of the recovery-email proving service this vault recovers through (e.g.
     * https://zkemail.nihilium.io). Nothing is sent to it while sealing — it is recorded on the seal so
     * a later unseal knows where to go without being told again.
     */
    emailServiceUrl?: string;
    /** k — how many processors must cooperate to recover the vault. */
    threshold: number;
    /** Network the verifier contract addresses are resolved from. */
    network: number;
    /** n — how many processors to seal with. Defaults to `threshold`. */
    processorCount?: number;
    /** m — lanes per member in the combinatorial threshold search. */
    searchWidth?: number;
    payment?: nhsdk.PaymentProvider;
    /** Explicit endpoints; when omitted they are selected from the registry. */
    processors?: nhsdk.types.ProcessorEndpoint[];
    dataStreams?: nhsdk.IDualDataStream[];
    proofLibrary?: nhsdk.ProofLibraryType;
    moduleLibrary?: nhsdk.ModuleLibraryType;
    onProgress?: (message: string) => void;
    /**
     * Structured sealing progress. Sealing runs one ZK proof per processor, so a k-of-n seal is k
     * multi-second proofs; this is what a caller drives a progress bar from. Its wording-free
     * counterpart of onProgress, which is derived from the same events.
     */
    onSealProgress?: (event: nhsdk.SealProgressEvent) => void;
};

/**
 * Human-readable line for a progress event, or undefined for stages that need no narration (the seal's
 * own completion is reported by the caller). Kept next to the option so the two never drift.
 */
function describeSealProgress(event: nhsdk.SealProgressEvent): string | undefined {
    // 1-based for display: "share 1 of 3" reads correctly, "share 0 of 3" does not.
    const share = `share ${(event.processor_index ?? 0) + 1} of ${event.processor_count}`;
    switch (event.stage) {
        case nhsdk.SealProgressStage.RequestingCommitment:
            return `Requesting commitment for ${share}...`;
        case nhsdk.SealProgressStage.ProvingShare:
            return `Proving ${share}...`;
        case nhsdk.SealProgressStage.ThresholdExpansion:
            return `Building threshold paths (${event.combinations} combinations)...`;
        case nhsdk.SealProgressStage.Assembling:
            return "Assembling the seal...";
        default:
            return undefined;
    }
}

type ZKEmailSealScenarioState = {
    /** The blob encrypted to the vault, kept so a resume re-embeds it instead of re-encrypting. */
    encrypted_value?: nhsdk.VaultEncryptedBlob;
};

/**
 * ZKEmail + HashTie sealing scenario — the counterpart of ZKEmailUnsealingClient, and the other half
 * of the flow the forgot-my-password front end drives.
 *
 * Sealing produces a vault keypair: the private key is protected by the k-of-n threshold and dropped,
 * and the public key is published on the seal. The value the caller passes is encrypted *to that
 * public key*, which is why more data can be added to the same vault later with encryptForVault and
 * no unseal — see `seal()`.
 *
 * The unseal conditions come from zk-email-full.json
 * ([opening -> HashTie -> ZKEmail]); the recovery email's hash is the one user input they require.
 */
export class ZKEmailSealingClient extends nhsdk.NihiliumSealingClient {
    private email: string;
    private emailServiceUrl?: string;
    private onProgress: (message: string) => void;
    /** Held between seal() and prepareSeal(), which is where the vault key becomes available. */
    private pendingValue?: string | Uint8Array;

    private constructor(
        processors: nhsdk.types.ProcessorEndpoint[],
        dataStreams: nhsdk.IDualDataStream[],
        template: nhsdk.types.UnsealConditionTemplate,
        opts: ZKEmailSealingOptions,
    ) {
        super(
            processors,
            dataStreams,
            template,
            opts.threshold,
            opts.payment,
            undefined,
            opts.searchWidth,
        );
        this.email = opts.email;
        this.emailServiceUrl = opts.emailServiceUrl?.replace(/\/+$/, "");
        this.onProgress = opts.onProgress ?? (() => { /* noop */ });
        // One subscription drives both callbacks, so the human-readable line stays in step with the
        // structured one instead of being narrated separately at a handful of call sites.
        this.on((event) => {
            opts.onSealProgress?.(event);
            const message = describeSealProgress(event);
            if (message) {
                this.onProgress(message);
            }
        });
    }

    /**
     * Build the collection, resolve the endpoints and compile the template. Endpoints passed in
     * `opts` win over registry selection, which is what lets a caller point every share at one
     * processor for local testing.
     */
    static async create(opts: ZKEmailSealingOptions): Promise<ZKEmailSealingClient> {
        const count = opts.processorCount ?? opts.threshold;
        if (count < opts.threshold) {
            throw new Error(`processorCount (${count}) must be >= threshold (${opts.threshold})`);
        }

        const processors = opts.processors ?? (await getFullProcessors()).slice(0, count);
        if (processors.length < opts.threshold) {
            throw new Error(
                `Need at least ${opts.threshold} processors to seal, found ${processors.length}`);
        }
        const dataStreams = opts.dataStreams ?? [(await getFullDatastreams())[0]];
        if (!dataStreams[0]) {
            throw new Error("No data stream available to seal against");
        }
        // getFullDatastreams() only constructs the clients — their address is fetched by initialize(),
        // and an uninitialized stream would compile the template with an empty data-root address, which
        // only surfaces much later as "invalid address" from the chained-proof verifier.
        await Promise.all(dataStreams.map(async (ds) => {
            if (!ds.getAddress()) {
                await ds.initialize();
            }
        }));

        const template = ZKEmailSealingClient.buildTemplate(opts);
        return new ZKEmailSealingClient(processors, dataStreams, template, opts);
    }

    /**
     * The compiled-from-JSON unseal conditions. The editor export carries no data stream, but the
     * opening proof has to be validated against one — without it the compiled template declares no
     * datastream input and unsealing later dereferences a stream that was never mapped.
     */
    static buildTemplate(opts: {
        network: number;
        proofLibrary?: nhsdk.ProofLibraryType;
        moduleLibrary?: nhsdk.ModuleLibraryType;
    }): nhsdk.types.UnsealConditionTemplate {
        const proofLibrary = opts.proofLibrary ?? new nhsdk.StandardProofLibrary();
        const moduleLibrary = opts.moduleLibrary ?? new nhsdk.StandardModuleLibrary();
        const collection = new nhsdk.types.UnsealConditionCollection(
            collectionJson.name, collectionJson.description, proofLibrary, moduleLibrary,
        );
        collection.import_from_json(collectionJson);
        collection.add_data_stream(DATA_STREAM_ID, OPENING_MODULE_NODE_ID, "dual_merkle_root");
        return collection.createTemplate(nhsdk.toAddressMap(opts.network));
    }

    /**
     * Seal `value` into a new vault. Returns the NihiliumSeal, which carries the vault public key, the
     * encrypted value and the recovery email — everything the unsealing client needs later.
     *
     * The value is encrypted to the vault public key, not to a key the caller holds, so this client
     * never sees the vault private key: only a k-of-n unseal brings it back.
     */
    async seal(value: string | Uint8Array, metadataRoot?: bigint): Promise<nhsdk.types.NihiliumSeal> {
        const metadata_root = metadataRoot ?? nhsdk.cryptoTools.generateRandom248BitNumber();
        const dataStreamAddress = this.dataStreams[0].getAddress();
        if (!dataStreamAddress) {
            throw new Error(
                "Data stream has no address — call initialize() on it before sealing, or let " +
                "ZKEmailSealingClient.create() resolve it");
        }
        this.pendingValue = value;
        this.onProgress("Sealing across processors...");
        return this.start_sealing(
            metadata_root,
            { [`${this.zkEmailModuleId()}:email_address_hash`]: BigInt(hashEmailAddress(this.email)) },
            { [DATA_STREAM_ID]: this.dataStreams[0].getAddress() },
        );
    }

    /**
     * Encrypt the value to the vault public key, once it exists and before the seal is assembled.
     * Skipped on a resume that already has the blob, so the same ciphertext is re-embedded rather than
     * re-encrypted under a fresh ephemeral key.
     */
    protected override async prepareSeal(): Promise<void> {
        if (this.getScenarioState<ZKEmailSealScenarioState>().encrypted_value) {
            return;
        }
        if (this.pendingValue === undefined) {
            throw new Error("ZKEmailSealingClient: no value to seal; call seal(value) rather than start_sealing");
        }
        this.onProgress("Encrypting value to the vault public key...");
        const encrypted_value = await nhsdk.encryptForVault(this.get_vault_public_key(), this.pendingValue);
        await this.setScenarioState({ encrypted_value });
    }

    /** The recovery email travels per package; the unsealing client falls back to it. */
    protected override buildProvingHints(): any {
        return { email: this.email };
    }

    /**
     * The seal-level hints: the email, the blob encrypted to the vault, and where recovery happens.
     * Recording the service URL keeps the seal self-describing — a recovery only needs the .nh file.
     */
    protected override buildSharedProvingHints(): any {
        const { encrypted_value } = this.getScenarioState<ZKEmailSealScenarioState>();
        return { email: this.email, encrypted_value, email_service_url: this.emailServiceUrl };
    }

    /** The ZKEmail node's id in the compiled collection, which keys its user input. */
    private zkEmailModuleId(): string {
        const node = collectionJson.nodes.find((n) => n.module_name === "ZKEmailModule");
        if (!node) {
            throw new Error("zk-email-full.json has no ZKEmailModule node");
        }
        return node.node_id;
    }
}
