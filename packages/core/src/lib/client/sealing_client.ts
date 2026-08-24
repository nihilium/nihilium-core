import {
    ClientProcessorSealingPhase,
    NihiliumSeal,
    ProcessorEndpoint,
    VaultPublicKey,
} from "../../types/protocol/common";
import { generateVaultKeypair, vaultPublicKeyFor } from "../vault/vault_crypto";
import { IDualDataStream } from "../data_stream/types";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { ClientSingleShareSealingProcess } from "./client_single_share_sealing";
import { PaymentProvider, NihiliumPaymentProviderUnauthenticated, hashRequestBody } from "./payments";
import {
    NihiliumEncryptionMode,
    NihiliumSealingStatus,
    ProcessorSealPhase,
    SealProgressEvent,
    SealProgressStage,
    SealingStateStore,
    SerializedSealingState,
    defaultSealingStateStore,
} from "./types";
// Combinatorial-threshold primitive is re-exported from the package entry (currently backed by the
// "hard" m-search module); swapping the backing implementation is a one-line change in the package
// index, not here.
import { cryptoTools, FDTEncrypt } from "@nihilium/zkp-circuits";

export { NihiliumSealingStatus } from "./types";

const SEALING_STATE_VERSION = 1;

/**
 * Template inputs are field elements (usually bigints), but the persisted seal state and its storage-key
 * hash must be JSON-serializable. Normalize to decimal strings for storage, and back to bigints for the
 * template compile. Accepts bigint / number / decimal- or hex-string values.
 */
function normalize_template_inputs(inputs: { [key: string]: any }): { [key: string]: string } {
    const out: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(inputs)) {
        out[key] = typeof value === "bigint" ? value.toString() : String(value);
    }
    return out;
}

function to_bigint_template_inputs(inputs: { [key: string]: any }): { [key: string]: bigint } {
    const out: { [key: string]: bigint } = {};
    for (const [key, value] of Object.entries(inputs)) {
        out[key] = BigInt(value);
    }
    return out;
}

/**
 * C(n, k) — how many k-subsets the threshold expansion covers, for progress reporting. Computed rather
 * than counted: FDTEncrypt's indexCombinations is internal to the primitive, and materializing every
 * subset just to take its length would duplicate the expansion's own work.
 */
function binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 0; i < Math.min(k, n - k); i++) {
        result = (result * (n - i)) / (i + 1);
    }
    return Math.round(result);
}

/**
 * Primary entry point for Nihilium sealing.
 *
 * Drives one single-share seal per processor, collects each processor's composite
 * `constructed_public_key`, and feeds those N public keys into the combinatorial-threshold
 * encryption (FDTEncrypt) to produce the single `fdt_seal`. The assembled result is a NihiliumSeal.
 *
 * Production-grade for sealing: every state transition is persisted, so a crash (very likely during
 * the heavy per-processor ZK proofs) can be resumed. The paid processor call and the local ZK proof
 * are split and checkpointed so a proof crash re-runs locally and never re-charges the processor.
 */
export class NihiliumSealingClient {

    // Protected so scenario subclasses (e.g. ZKEmailSealingClient) can read the endpoints/template and
    // the persisted state when they contribute proving hints or scenario state.
    protected processors: ProcessorEndpoint[];
    protected dataStreams: IDualDataStream[];
    protected unsealConditionTemplate: UnsealConditionTemplate;
    protected threshold: number;
    protected search_width: number;
    protected status: NihiliumSealingStatus;
    protected encryption_mode: NihiliumEncryptionMode;
    protected paymentProvider: PaymentProvider;
    protected state?: SerializedSealingState;
    protected store: SealingStateStore = defaultSealingStateStore();
    protected storage_key?: string;
    private progressListeners: ((event: SealProgressEvent) => void)[] = [];

    constructor(
        processors: ProcessorEndpoint[],
        dataStreams: IDualDataStream[],
        unsealConditionTemplate: UnsealConditionTemplate,
        threshold: number,
        paymentProvider: PaymentProvider = new NihiliumPaymentProviderUnauthenticated(),
        encryption_mode: NihiliumEncryptionMode = NihiliumEncryptionMode.OneTimeSingleAesEncryption,
        search_width: number = 1) {
            if (threshold > processors.length) {
                throw new Error("Threshold is greater than the number of processors");
            }
            if (threshold < 1) {
                throw new Error("Threshold is less than 1");
            }
            if (search_width < 1) {
                throw new Error("Search width m must be at least 1");
            }
        this.processors = processors;
        this.dataStreams = dataStreams;
        this.unsealConditionTemplate = unsealConditionTemplate;
        this.threshold = threshold;
        this.search_width = search_width;
        this.encryption_mode = encryption_mode;
        this.paymentProvider = paymentProvider;
        this.status = NihiliumSealingStatus.Ready_to_seal;
    }

    /** Override the persistence backend (e.g. a file/DB store for Node/tests). */
    set_state_store(store: SealingStateStore): void {
        this.store = store;
    }

    /**
     * Subscribe to sealing progress. The counterpart of the unsealing client's module events: sealing
     * runs n opening proofs, and without this a caller has nothing to show for the minutes they take.
     */
    on(listener: (event: SealProgressEvent) => void): void {
        this.progressListeners.push(listener);
    }

    /**
     * `completed` is derived from the persisted records rather than a counter, so a resumed seal reports
     * the work already done instead of restarting the count at zero.
     */
    private emitProgress(stage: SealProgressStage, extra: Partial<SealProgressEvent> = {}): void {
        if (this.progressListeners.length === 0) {
            return;
        }
        const records = this.state?.per_processor ?? [];
        let completed = 0;
        for (const rec of records) {
            if (rec.phase === ProcessorSealPhase.Sealed) completed += 2;         // paid POST + proof
            else if (rec.phase === ProcessorSealPhase.Responded) completed += 1; // paid POST only
        }
        if (this.state?.fdt_seal) completed += 1;
        if (this.state?.seal) completed += 1;

        const event: SealProgressEvent = {
            stage,
            processor_count: this.processors.length,
            completed,
            total: this.processors.length * 2 + 2,
            ...extra,
        };
        for (const listener of this.progressListeners) {
            // A listener that throws must not fail a seal the caller has already paid for.
            try { listener(event); } catch { /* ignore */ }
        }
    }

    load_sealing_state(state: SerializedSealingState): void {
        this.state = state;
        this.status = state.status;
    }

    save_sealing_state(): SerializedSealingState {
        if (!this.state) {
            throw new Error("No sealing state to save");
        }
        return this.state;
    }

    get_status(): NihiliumSealingStatus {
        return this.status;
    }

    is_done(): boolean {
        return this.status === NihiliumSealingStatus.Sealed;
    }

    /** The finished seal. Throws until sealing is complete. */
    get_seal(): NihiliumSeal {
        if (this.status !== NihiliumSealingStatus.Sealed || !this.state?.seal) {
            throw new Error("Seal is not complete");
        }
        return this.state.seal;
    }

    /**
     * Seal a freshly generated vault keypair under the k-of-n combinatorial threshold across the
     * processors. The private key is what the threshold protects; the caller never sees it and it is
     * dropped once the seal exists. Only its public half survives, on the seal, so data can be
     * encrypted into the vault afterwards without unsealing (see encryptForVault).
     *
     * Idempotent and resumable: if state for the same inputs is already persisted (or loaded via
     * load_sealing_state), it is picked up and driven to completion — already-paid processors are not
     * re-charged and already-proved processors are not re-proved, and the resume seals the SAME vault
     * key rather than generating a new one. Returns the finished NihiliumSeal.
     */
    async start_sealing(
        metadata_root: bigint,
        template_inputs: { [key: string]: any } = {},
        data_stream_mapping: { [key: string]: string } = {},
    ): Promise<NihiliumSeal> {
        // If the caller gives no explicit mapping, map every datastream input the template declares to
        // the client's first datastream (the common single-datastream case, e.g. reveal-only). This
        // lets callers seal with just (secret, metadata_root); pass an explicit mapping for multi-stream
        // templates.
        if (Object.keys(data_stream_mapping).length === 0) {
            data_stream_mapping = this.derive_data_stream_mapping();
        }
        // Template inputs are field elements, typically bigints. The persisted state and its storage-key
        // hash must be JSON-serializable, so keep them as decimal strings here; they are converted back to
        // bigints when the template is compiled (see seal_one_processor). Without this, a bigint input
        // (e.g. email_address_hash) throws "Do not know how to serialize a BigInt".
        const normalized_inputs = normalize_template_inputs(template_inputs);
        this.storage_key = this.compute_storage_key(metadata_root, normalized_inputs, data_stream_mapping);

        // Pick up persisted state (resume) unless we already hold in-memory state for this seal.
        if (!this.state) {
            const persisted = await this.store.load(this.storage_key);
            if (persisted) {
                this.state = persisted;
                this.status = persisted.status;
            }
        }
        if (!this.state) {
            // The vault keypair is generated exactly once per seal and persisted immediately: an unseal
            // recovers this scalar, so a resume that generated a new one would produce a seal whose
            // published public key no longer matches what the threshold protects.
            const vault = generateVaultKeypair();
            this.state = {
                version: SEALING_STATE_VERSION,
                status: NihiliumSealingStatus.Ready_to_seal,
                secret: vault.privateKey.toString(),
                vault_public_key: vault.publicKey,
                metadata_root: metadata_root.toString(),
                template_inputs: normalized_inputs,
                data_stream_mapping,
                shared_threshold: this.threshold,
                shared_search_width: this.search_width,
                per_processor: this.processors.map((_, i) => ({ processor_index: i, phase: ProcessorSealPhase.Pending })),
            };
            await this.persist();
        }

        // Already finished on a previous run.
        if (this.state.status === NihiliumSealingStatus.Sealed && this.state.seal) {
            this.status = NihiliumSealingStatus.Sealed;
            return this.state.seal;
        }

        if (!this.state.secret) {
            throw new Error(
                "Persisted sealing state has no vault key but is not Sealed; it cannot be completed " +
                "(the key an unseal would recover is gone). Start a new seal.",
            );
        }
        const active_secret = BigInt(this.state.secret);
        // Older state may predate the stored public key; derive it rather than regenerating the pair.
        if (!this.state.vault_public_key) {
            this.state.vault_public_key = vaultPublicKeyFor(active_secret);
        }

        try {
            // ---- Phase 1: per-processor commitments (paid POST + local ZK proof) ----
            this.set_status(NihiliumSealingStatus.Requesting_commitments);
            for (let i = 0; i < this.processors.length; i++) {
                await this.seal_one_processor(i, active_secret);
            }

            // ---- Phase 2: combinatorial threshold encryption over the composite public keys ----
            await this.produce_threshold_encryption(active_secret);

            // Scenario hook: last chance to use the vault key before the seal is assembled (the ZKEmail
            // client encrypts the caller's value to it here). Runs after the shares exist, so anything
            // it persists is picked up by the hint builders below.
            await this.prepareSeal();

            // ---- Phase 3: assemble + finalize ----
            this.emitProgress(SealProgressStage.Assembling);
            const seal = this.assemble_seal();
            this.state.seal = seal;
            this.state.secret = undefined; // clear sensitive material now the seal exists
            this.set_status(NihiliumSealingStatus.Sealed);
            await this.persist();
            this.emitProgress(SealProgressStage.Sealed);
            return seal;
        } catch (err) {
            this.set_status(NihiliumSealingStatus.Failed);
            await this.persist();
            throw err;
        }
    }

    /** Same-instance convenience: continue the seal held in memory using its persisted inputs. */
    async resume(): Promise<NihiliumSeal> {
        if (!this.state) {
            throw new Error("No in-memory state to resume; call start_sealing with the original inputs");
        }
        if (!this.state.secret) {
            if (this.state.status === NihiliumSealingStatus.Sealed && this.state.seal) {
                return this.state.seal;
            }
            throw new Error("Persisted state has no vault key to resume with");
        }
        return this.start_sealing(
            BigInt(this.state.metadata_root),
            this.state.template_inputs,
            this.state.data_stream_mapping,
        );
    }

    /**
     * The vault's public key — available as soon as sealing starts, and the only half that outlives it.
     * Anyone holding it can encrypt data into the vault (encryptForVault) with no unseal and no network.
     */
    get_vault_public_key(): VaultPublicKey {
        if (!this.state?.vault_public_key) {
            throw new Error("No vault key yet; call start_sealing first");
        }
        return this.state.vault_public_key;
    }

    // ---- Scenario extension surface --------------------------------------------------------------
    // Override these in a subclass to build a specific sealing scenario. The base seals nothing beyond
    // the vault key itself, so both hints default to empty.

    /**
     * Runs after every share is sealed and before the seal is assembled, with the vault public key
     * available via get_vault_public_key(). Anything persisted here (see setScenarioState) is visible
     * to buildProvingHints/buildSharedProvingHints. No-op by default.
     */
    protected async prepareSeal(): Promise<void> {
        // no-op
    }

    /**
     * Per-processor proving hints, stored on each package's private_package. Use for data an unseal
     * scenario needs before it can prove (the ZKEmail scenario puts the recovery email here).
     */
    protected buildProvingHints(): any {
        return {};
    }

    /**
     * Seal-level proving hints, stored once on the seal. Use for data that is not per-processor — e.g.
     * a blob encrypted to the vault public key that should travel with the seal.
     */
    protected buildSharedProvingHints(): any {
        return {};
    }

    /** Read the scenario's persisted, JSON-serializable state (empty object if none yet). */
    protected getScenarioState<T extends { [key: string]: any } = { [key: string]: any }>(): T {
        return (this.state?.scenario_state ?? {}) as T;
    }

    /** Merge a patch into the scenario's persisted state and save it, so a resume reuses it. */
    protected async setScenarioState(patch: { [key: string]: any }): Promise<void> {
        if (!this.state) return;
        this.state.scenario_state = { ...(this.state.scenario_state ?? {}), ...patch };
        await this.persist();
    }

    // ---------------------------------------------------------------------------------------------

    /**
     * Seal one processor's share. Resumable at each sub-phase so a crash never re-charges the
     * processor: the paid POST and the local ZK proof are separate persisted checkpoints.
     */
    private async seal_one_processor(i: number, secret: bigint): Promise<void> {
        const rec = this.state!.per_processor[i];
        if (rec.phase === ProcessorSealPhase.Sealed) {
            // Still report it: a resume that skips finished shares must paint them, not start at zero.
            this.emitProgress(SealProgressStage.ShareSealed, { processor_index: i });
            return; // already done — no re-pay, no re-proof
        }

        const proc = ClientSingleShareSealingProcess.create({
            processor: this.processors[i],
            dataStreams: this.dataStreams,
            // Each processor gets its own fresh, uncompiled template clone: initialize() compiles it,
            // and compile() throws if a template is already compiled. Deliberately duplicated work per
            // processor for clarity; every clone compiles to the identical unseal_condition_root because
            // the metadata root and inputs are shared.
            template: this.clone_uncompiled_template(),
            provingHints: this.buildProvingHints(),
            payment: this.paymentProvider,
        });
        // initialize() deterministically recomputes unseal_condition_root and re-imports zkeddsa, and
        // sets the secret used for the (unchanged) per-processor encrypted_secret. It also generates a
        // fresh random reveal-value preimage, which we override below when resuming.
        await proc.initialize(
            secret,
            BigInt(this.state!.metadata_root),
            // Stored as strings for JSON-safety; the template compile needs bigint field elements.
            to_bigint_template_inputs(this.state!.template_inputs),
            this.state!.data_stream_mapping,
        );

        // --- Step 1: obtain the paid response (skip entirely if already persisted) ---
        if (rec.phase !== ProcessorSealPhase.Responded) {
            this.set_status(NihiliumSealingStatus.Requesting_commitments);
            this.emitProgress(SealProgressStage.RequestingCommitment, { processor_index: i });
            if (rec.phase === ProcessorSealPhase.Posting && rec.reveal_value_preimage) {
                // Crash around the paid POST: response was never persisted. Re-POST the identical
                // request (same preimage) so an idempotent processor won't double-charge. This is the
                // one narrow, unavoidable re-pay window if the processor is not idempotent.
                proc.load_state({
                    reveal_value_preimage: BigInt(rec.reveal_value_preimage),
                    phase: ClientProcessorSealingPhase.GENERATING_SECRETS,
                });
            } else {
                // Fresh: bind and persist the preimage BEFORE paying so the response stays processable.
                rec.reveal_value_preimage = proc.get_reveal_value_preimage().toString();
                rec.phase = ProcessorSealPhase.Posting;
                await this.persist();
            }
            const raw = await proc.post_commitment_request(false); // PAID POST — no ZK proof yet
            rec.raw_response = raw;
            rec.phase = ProcessorSealPhase.Responded;
            await this.persist(); // persisted BEFORE the crash-prone ZK proof
        } else {
            // Resuming with the paid response already in hand: restore the preimage and position the
            // process to prove against it.
            proc.load_state({ reveal_value_preimage: BigInt(rec.reveal_value_preimage!) });
        }

        // --- Step 2: local ZK proof — free to retry, never re-charges the processor ---
        this.set_status(NihiliumSealingStatus.Producing_proofs);
        this.emitProgress(SealProgressStage.ProvingShare, { processor_index: i });
        const storage_package = await proc.process_seal_response(rec.raw_response!);
        rec.storage_package = storage_package;
        rec.phase = ProcessorSealPhase.Sealed;
        if (!this.state!.unseal_condition_root) {
            this.state!.unseal_condition_root = storage_package.private_package.unseal_condition_root;
        }
        await this.persist();
        this.emitProgress(SealProgressStage.ShareSealed, { processor_index: i });
    }

    /**
     * Encrypt the secret under the k-of-n combinatorial threshold of the collected composite public
     * keys. Idempotent: skips if fdt_seal already exists in state.
     */
    private async produce_threshold_encryption(secret: bigint): Promise<void> {
        this.set_status(NihiliumSealingStatus.Producing_threshold_encryptions);
        if (this.state!.fdt_seal) {
            return;
        }
        const pubKeys = this.state!.per_processor.map((r) => {
            const cpk = r.storage_package!.private_package.constructed_public_key;
            return cryptoTools.coordinatesToExtPointBigint(BigInt(cpk[0]), BigInt(cpk[1]));
        });
        this.emitProgress(SealProgressStage.ThresholdExpansion, {
            combinations: binomial(pubKeys.length, this.threshold),
        });
        // FDTEncrypt is a synchronous loop over every k-subset, so without yielding first a browser
        // never repaints and the event above is invisible. Milliseconds at the default search width;
        // this is insurance for a larger m, where the expansion is the one blocking step in a seal.
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.state!.fdt_seal = FDTEncrypt(secret, pubKeys, this.threshold, this.search_width);
        await this.persist();
    }

    private assemble_seal(): NihiliumSeal {
        const packages = this.state!.per_processor.map((r) => {
            if (!r.storage_package) {
                throw new Error(`Processor ${r.processor_index} has no storage package`);
            }
            return r.storage_package;
        });
        const first = packages[0].private_package;
        return {
            packages,
            fdt_seal: this.state!.fdt_seal!,
            shared_unseal_template: first.unseal_template,
            shared_unseal_condition_root: first.unseal_condition_root,
            shared_metadata_root: this.state!.metadata_root,
            shared_proving_hints: this.buildSharedProvingHints(),
            vault_public_key: this.state!.vault_public_key,
        };
    }

    /**
     * A fresh, uncompiled copy of the template. compile() throws on an already-compiled template, so
     * each single-share process must own its own instance. The constructor rebuilds an uncompiled
     * template from the same read-only compiled_collection (module definitions); compile() only writes
     * to per-instance fields, so sharing that collection reference across clones is safe.
     */
    /**
     * Map every datastream input the template declares to the client's first datastream. Used when
     * the caller omits an explicit data_stream_mapping — correct for single-datastream templates
     * (e.g. reveal-only). compile() throws if any declared datastream input is left unmapped.
     */
    private derive_data_stream_mapping(): { [key: string]: string } {
        const mapping: { [key: string]: string } = {};
        if (this.dataStreams.length === 0) {
            return mapping;
        }
        const address = this.dataStreams[0].getAddress();
        for (const path of this.unsealConditionTemplate.data_streams ?? []) {
            for (const ds of path) {
                mapping[ds.datastream_id] = address;
            }
        }
        return mapping;
    }

    private clone_uncompiled_template(): UnsealConditionTemplate {
        const t = this.unsealConditionTemplate;
        const clone = new UnsealConditionTemplate(
            t.name,
            t.description,
            t.proof_library,
            t.module_library,
            t.compiled_collection,
        );
        clone.collection_id = t.collection_id;
        return clone;
    }

    private set_status(status: NihiliumSealingStatus): void {
        this.status = status;
        if (this.state) {
            this.state.status = status;
        }
    }

    private async persist(): Promise<void> {
        if (this.state && this.storage_key) {
            await this.store.save(this.storage_key, this.state);
        }
    }

    /**
     * Deterministic, stable-across-resumes storage key. Built from the identifying seal inputs
     * (metadata root, threshold/search width, template inputs, data-stream mapping, and processor
     * addresses) so the same seal always maps to the same slot.
     */
    private compute_storage_key(
        metadata_root: bigint,
        template_inputs: { [key: string]: any },
        data_stream_mapping: { [key: string]: string },
    ): string {
        const descriptor = {
            metadata_root: metadata_root.toString(),
            threshold: this.threshold,
            search_width: this.search_width,
            template_inputs,
            data_stream_mapping,
            processors: this.processors.map((p) => p.server_address),
        };
        return `nihilium_sealing_${hashRequestBody(descriptor)}`;
    }
}
