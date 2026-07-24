import { NihiliumSeal, ProcessorEndpoint } from "../../types/protocol/common";
import { IDualDataStream } from "../data_stream/types";
import { ClientSingleShareUnsealingProcess, UnsealResolvers } from "./client_single_share_unsealing";
import { UnsealConditionCollection } from "../unseal_conditions/collections/UnsealConditionCollection";
import { from_json } from "../unseal_conditions/collections/UnsealConditionTemplate";
import { StandardProofLibrary, ProofLibraryType } from "../unseal_conditions/proofs";
import { StandardModuleLibrary, ModuleLibraryType } from "../unseal_conditions/modules";
import { hashRequestBody } from "./payments";
import {
    NihiliumUnsealingStatus,
    ProcessorUnsealPhase,
    ProcessorUnsealRecord,
    SerializedUnsealingState,
    UnsealingStateStore,
    defaultUnsealingStateStore,
} from "./types";
// Combinatorial-threshold recovery, re-exported from the package entry.
import { FDTDecrypt } from "@nihilium/zkp-circuits";

export { NihiliumUnsealingStatus } from "./types";

const UNSEALING_STATE_VERSION = 1;

export type NihiliumUnsealingClientOptions = {
    /** The collection used at seal time; functionally unused by the unseal flow, so optional. */
    collection?: UnsealConditionCollection;
    proofLibrary?: ProofLibraryType;
    moduleLibrary?: ModuleLibraryType;
    store?: UnsealingStateStore;
};

export type StartUnsealingOptions = {
    dataStreamId?: string;
    proofIndex?: number;
    resolvers?: UnsealResolvers;
};

/**
 * Recovers the secret from a NihiliumSeal via the combinatorial-threshold fdt_seal — the counterpart
 * to NihiliumSealingClient. The caller names the exact k-subset of processors to unseal; the client
 * recovers each one's composite private scalar and FDTDecrypts the fdt_seal.
 *
 * Same production shape as the sealing client (resumable, state-persisting, injectable store). Unlike
 * sealing, /request_unseal is never paid, so resumability is about surviving crashes and not
 * re-publishing reveal values / re-running the local unseal ZK proofs — not about avoiding re-charges.
 * Reveal values are posted directly to the data stream and batched into one publication.
 */
export class NihiliumUnsealingClient {

    private seal: NihiliumSeal;
    private processors: ProcessorEndpoint[];
    private dataStreams: IDualDataStream[];
    private collection?: UnsealConditionCollection;
    private proofLibrary: ProofLibraryType;
    private moduleLibrary: ModuleLibraryType;
    private store: UnsealingStateStore;
    private status: NihiliumUnsealingStatus;
    private state?: SerializedUnsealingState;
    private storage_key?: string;

    constructor(
        seal: NihiliumSeal,
        processors: ProcessorEndpoint[],
        dataStreams: IDualDataStream[],
        opts: NihiliumUnsealingClientOptions = {},
    ) {
        this.seal = seal;
        this.processors = processors;
        this.dataStreams = dataStreams;
        this.collection = opts.collection;
        this.proofLibrary = opts.proofLibrary ?? new StandardProofLibrary();
        this.moduleLibrary = opts.moduleLibrary ?? new StandardModuleLibrary();
        this.store = opts.store ?? defaultUnsealingStateStore();
        this.status = NihiliumUnsealingStatus.Ready_to_unseal;
    }

    set_state_store(store: UnsealingStateStore): void {
        this.store = store;
    }

    load_unsealing_state(state: SerializedUnsealingState): void {
        this.state = state;
        this.status = state.status;
    }

    save_unsealing_state(): SerializedUnsealingState {
        if (!this.state) {
            throw new Error("No unsealing state to save");
        }
        return this.state;
    }

    get_status(): NihiliumUnsealingStatus {
        return this.status;
    }

    is_done(): boolean {
        return this.status === NihiliumUnsealingStatus.Unsealed;
    }

    /** The recovered secret. Throws until unsealing is complete. */
    get_secret(): bigint {
        if (this.status !== NihiliumUnsealingStatus.Unsealed || !this.state?.secret) {
            throw new Error("Secret is not recovered yet");
        }
        return BigInt(this.state.secret);
    }

    /**
     * Recover the secret using the given k-subset of processor indices (k = seal.fdt_seal.threshold).
     * Idempotent and resumable: if state for this seal + subset is already persisted (or loaded via
     * load_unsealing_state), it is picked up and driven to completion. Returns the secret.
     */
    async start_unsealing(processorIndices: number[], opts: StartUnsealingOptions = {}): Promise<bigint> {
        const threshold = this.seal.fdt_seal.threshold;
        if (processorIndices.length !== threshold) {
            throw new Error(
                `Unsealing needs exactly the threshold (${threshold}) processor indices; got ${processorIndices.length}`,
            );
        }
        for (const i of processorIndices) {
            if (i < 0 || i >= this.seal.packages.length) {
                throw new Error(`Processor index ${i} out of range [0, ${this.seal.packages.length})`);
            }
        }
        const dataStreamId = opts.dataStreamId ?? this.dataStreams[0].getAddress();
        const proofIndex = opts.proofIndex ?? 0;

        this.storage_key = this.compute_storage_key(processorIndices);
        if (!this.state) {
            const persisted = await this.store.load(this.storage_key);
            if (persisted) {
                this.state = persisted;
                this.status = persisted.status;
            }
        }
        if (!this.state) {
            this.state = {
                version: UNSEALING_STATE_VERSION,
                status: NihiliumUnsealingStatus.Ready_to_unseal,
                processor_indices: [...processorIndices],
                reveal_published: false,
                data_stream_id: dataStreamId,
                per_processor: processorIndices.map((i) => ({ processor_index: i, phase: ProcessorUnsealPhase.Pending })),
            };
            await this.persist();
        }

        if (this.state.status === NihiliumUnsealingStatus.Unsealed && this.state.secret) {
            this.status = NihiliumUnsealingStatus.Unsealed;
            return BigInt(this.state.secret);
        }

        try {
            // Phase 1: publish the k reveal values directly to the data stream, batched into one round.
            await this.publish_reveal_values(dataStreamId);

            // Phase 2: recover each chosen processor's composite private scalar.
            this.set_status(NihiliumUnsealingStatus.Recovering_scalars);
            for (const rec of this.state.per_processor) {
                await this.unseal_one_processor(rec, proofIndex, opts.resolvers);
            }

            // Phase 3: FDTDecrypt the combinatorial-threshold package with the k scalars.
            this.set_status(NihiliumUnsealingStatus.Recovering_secret);
            const scalars = this.state.per_processor.map((r) => BigInt(r.composite_scalar!));
            const secret = FDTDecrypt(scalars, this.seal.fdt_seal); // decimal string
            this.state.secret = secret;
            for (const r of this.state.per_processor) {
                r.composite_scalar = undefined; // clear sensitive material now the secret exists
            }
            this.set_status(NihiliumUnsealingStatus.Unsealed);
            await this.persist();
            return BigInt(secret);
        } catch (err) {
            this.set_status(NihiliumUnsealingStatus.Failed);
            await this.persist();
            throw err;
        }
    }

    /** Same-instance convenience: continue the unseal held in memory using its persisted inputs. */
    async resume(): Promise<bigint> {
        if (!this.state) {
            throw new Error("No in-memory state to resume; call start_unsealing with the original inputs");
        }
        if (this.state.status === NihiliumUnsealingStatus.Unsealed && this.state.secret) {
            return BigInt(this.state.secret);
        }
        return this.start_unsealing(this.state.processor_indices, { dataStreamId: this.state.data_stream_id });
    }

    // ---------------------------------------------------------------------------------------------

    /**
     * Batch-publish the chosen processors' reveal values straight to the data stream (not via the
     * processors). Values already provable are skipped; the rest go out in a single postData — one
     * merkle round for all k, so they all become provable together (only the first
     * await_reveal_value_to_be_provable pays the publishing-interval wait).
     */
    private async publish_reveal_values(dataStreamId: string): Promise<void> {
        if (this.state!.reveal_published) {
            return;
        }
        this.set_status(NihiliumUnsealingStatus.Publishing_reveal_values);
        const dataStream = this.dataStreams.find((ds) => ds.getAddress() === dataStreamId) ?? this.dataStreams[0];

        const toPost: string[] = [];
        for (const rec of this.state!.per_processor) {
            const pkg = this.seal.packages[rec.processor_index];
            const revealValue = BigInt(pkg.public_package.reveal_value).toString();
            if (!(await dataStream.isProvable(revealValue))) {
                toPost.push(revealValue);
            }
        }
        if (toPost.length > 0) {
            await dataStream.postData(toPost);
        }
        this.state!.reveal_published = true;
        await this.persist();
    }

    /**
     * Unseal one processor and record its composite private scalar. Its reveal value is already in the
     * batch, so this just waits for provability, produces the unseal proof, sends the (unpaid) unseal
     * request, and recovers the scalar. Skipped on resume once already Unsealed.
     */
    private async unseal_one_processor(
        rec: ProcessorUnsealRecord,
        proofIndex: number,
        resolvers?: UnsealResolvers,
    ): Promise<void> {
        if (rec.phase === ProcessorUnsealPhase.Unsealed && rec.composite_scalar) {
            return; // already recovered — no re-prove, no re-request
        }
        const pkg = this.seal.packages[rec.processor_index];
        const template = from_json(pkg.private_package.unseal_template!, this.proofLibrary, this.moduleLibrary);
        const unseal = await ClientSingleShareUnsealingProcess.create({
            processor: this.processors[rec.processor_index],
            collection: this.collection,
            template,
            dataStreams: this.dataStreams,
            seal: pkg,
        });
        // Reveal value already batch-published; poll until provable (advances the single-share to
        // REVEAL_VALUE_EXPOSED, which get_unseal_request requires) without going through publish_reveal_value.
        await unseal.await_reveal_value_to_be_provable();
        const { proofs, public_inputs } = await unseal.runPath(proofIndex, resolvers);
        await unseal.unseal_request_to_processor(proofIndex, proofs, public_inputs); // unpaid POST /request_unseal
        rec.composite_scalar = unseal.recover_composite_scalar().toString();
        rec.phase = ProcessorUnsealPhase.Unsealed;
        await this.persist();
    }

    private set_status(status: NihiliumUnsealingStatus): void {
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

    /** Deterministic, stable-across-resumes storage key from the seal identity and chosen subset. */
    private compute_storage_key(processorIndices: number[]): string {
        const descriptor = {
            reveal_values: this.seal.packages.map((p) => p.public_package.reveal_value),
            processor_indices: processorIndices,
            threshold: this.seal.fdt_seal.threshold,
        };
        return `nihilium_unsealing_${hashRequestBody(descriptor)}`;
    }
}
