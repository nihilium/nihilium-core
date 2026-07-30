import {
    ClientProcessorSealingPhase,
    NihiliumSeal,
    ProcessorEndpoint,
} from "../../types/protocol/common";
import { IDualDataStream } from "../data_stream/types";
import { UnsealConditionTemplate } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { ClientSingleShareSealingProcess } from "./client_single_share_sealing";
import { PaymentProvider, NihiliumPaymentProviderUnauthenticated, hashRequestBody } from "./payments";
import {
    NihiliumEncryptionMode,
    NihiliumSealingStatus,
    ProcessorSealPhase,
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

    private processors: ProcessorEndpoint[];
    private dataStreams: IDualDataStream[];
    private unsealConditionTemplate: UnsealConditionTemplate;
    private threshold: number;
    private search_width: number;
    private status: NihiliumSealingStatus;
    private encryption_mode: NihiliumEncryptionMode;
    private paymentProvider: PaymentProvider;
    private state?: SerializedSealingState;
    private store: SealingStateStore = defaultSealingStateStore();
    private storage_key?: string;

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
     * Seal `secret` under the k-of-n combinatorial threshold across the processors.
     *
     * Idempotent and resumable: if state for the same inputs is already persisted (or loaded via
     * load_sealing_state), it is picked up and driven to completion — already-paid processors are not
     * re-charged and already-proved processors are not re-proved. Returns the finished NihiliumSeal.
     */
    async start_sealing(
        secret: bigint,
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
            this.state = {
                version: SEALING_STATE_VERSION,
                status: NihiliumSealingStatus.Ready_to_seal,
                secret: secret.toString(),
                metadata_root: metadata_root.toString(),
                template_inputs: normalized_inputs,
                data_stream_mapping,
                shared_threshold: this.threshold,
                shared_search_width: this.search_width,
                per_processor: this.processors.map((_, i) => ({ processor_index: i, phase: ProcessorSealPhase.Pending })),
            };
            await this.persist();
        } else if (!this.state.secret) {
            // Resuming state that still needs the secret (e.g. it was reloaded before completion).
            this.state.secret = secret.toString();
        }

        // Already finished on a previous run.
        if (this.state.status === NihiliumSealingStatus.Sealed && this.state.seal) {
            this.status = NihiliumSealingStatus.Sealed;
            return this.state.seal;
        }

        const active_secret = BigInt(this.state.secret!);

        try {
            // ---- Phase 1: per-processor commitments (paid POST + local ZK proof) ----
            this.set_status(NihiliumSealingStatus.Requesting_commitments);
            for (let i = 0; i < this.processors.length; i++) {
                await this.seal_one_processor(i, active_secret);
            }

            // ---- Phase 2: combinatorial threshold encryption over the composite public keys ----
            await this.produce_threshold_encryption(active_secret);

            // ---- Phase 3: assemble + finalize ----
            const seal = this.assemble_seal();
            this.state.seal = seal;
            this.state.secret = undefined; // clear sensitive material now the seal exists
            this.set_status(NihiliumSealingStatus.Sealed);
            await this.persist();
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
            throw new Error("Persisted state has no secret to resume with");
        }
        return this.start_sealing(
            BigInt(this.state.secret),
            BigInt(this.state.metadata_root),
            this.state.template_inputs,
            this.state.data_stream_mapping,
        );
    }

    // ---------------------------------------------------------------------------------------------

    /**
     * Seal one processor's share. Resumable at each sub-phase so a crash never re-charges the
     * processor: the paid POST and the local ZK proof are separate persisted checkpoints.
     */
    private async seal_one_processor(i: number, secret: bigint): Promise<void> {
        const rec = this.state!.per_processor[i];
        if (rec.phase === ProcessorSealPhase.Sealed) {
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
            provingHints: {},
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
        const storage_package = await proc.process_seal_response(rec.raw_response!);
        rec.storage_package = storage_package;
        rec.phase = ProcessorSealPhase.Sealed;
        if (!this.state!.unseal_condition_root) {
            this.state!.unseal_condition_root = storage_package.private_package.unseal_condition_root;
        }
        await this.persist();
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
            shared_proving_hints: {},
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
