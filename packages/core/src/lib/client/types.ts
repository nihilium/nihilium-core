import { FDTSealedPackage } from "@nihilium/zkp-circuits";
import { NihiliumSeal, SingleSealRequestResponse, SingleSealStoragePackage, VaultPublicKey } from "../../types/protocol/common";
import { ModuleProof } from "../unseal_conditions/modules";


export enum NihiliumEncryptionMode  {
    OneTimeSingleAesEncryption = "single_aes_encryption",
    SingleECCEncryption = "single_ecc_encryption",
}

/**
 * Top-level phase of a NihiliumSealingClient seal. Persisted with the state so a reloaded client
 * knows where to resume.
 */
export enum NihiliumSealingStatus {
    Ready_to_seal = "ready_to_seal",
    Paying_for_seal = "paying_for_seal",
    Payment_failed = "payment_failed",
    Requesting_commitments = "requesting_commitments",
    Producing_proofs = "producing_proofs",
    Producing_threshold_encryptions = "producing_threshold_encryptions",

    Sealed = "sealed",
    Failed = "failed",
}

/**
 * Per-processor sub-phase inside a seal. The record carries exactly the data required to resume
 * without re-charging the processor: the random reveal-value preimage (so a persisted response is
 * processable) and the raw response itself (persisted after the paid POST, before the ZK proof).
 */
export enum ProcessorSealPhase {
    Pending = "pending",      // nothing sent yet
    Posting = "posting",      // request built + preimage persisted; about to (or in the middle of) the paid POST
    Responded = "responded",  // paid response persisted; local ZK proof still pending (free to retry)
    Sealed = "sealed",        // storage_package produced
    Failed = "failed",
}

/**
 * Where a seal has got to, for callers that want to show progress. Sealing does the heavy ZK work —
 * one opening proof per processor — so a k-of-n seal is n multi-second proofs, and a caller with only
 * the top-level status has nothing to show for it.
 */
export enum SealProgressStage {
    /** About to make the paid POST for one processor. */
    RequestingCommitment = "requesting_commitment",
    /** About to produce that processor's opening proof — the slow step. */
    ProvingShare = "proving_share",
    /** That processor's share is complete. */
    ShareSealed = "share_sealed",
    /** About to run the combinatorial threshold encryption over every k-subset. */
    ThresholdExpansion = "threshold_expansion",
    /** Shares and threshold package done; building the NihiliumSeal. */
    Assembling = "assembling",
    Sealed = "sealed",
}

export type SealProgressEvent = {
    stage: SealProgressStage;
    /** Which processor this concerns; set on the per-share stages only. */
    processor_index?: number;
    /** n — how many processors this seal covers. */
    processor_count: number;
    /**
     * Steps finished out of `total`. Counted, not time-weighted: the paid POST is fast and the proof is
     * seconds, so the bar advances unevenly. `stage` + `processor_index` carry the real signal.
     */
    completed: number;
    /** 2n + 2 — a request and a proof per share, then the threshold expansion and the assembly. */
    total: number;
    /** C(n, k) — how many combinations the threshold expansion covers. Set on ThresholdExpansion. */
    combinations?: number;
};

export type ProcessorSealRecord = {
    processor_index: number;
    phase: ProcessorSealPhase;
    // Random preimage from initialize(); persisted so process_seal_response can validate the
    // persisted raw_response after a crash. Serialized as a decimal string.
    reveal_value_preimage?: string;
    // Persisted immediately AFTER the paid POST and BEFORE the ZK proof, so a crash during proving
    // resumes locally and never re-hits the paid endpoint.
    raw_response?: SingleSealRequestResponse;
    // Final per-processor result; carries private_package.constructed_public_key.
    storage_package?: SingleSealStoragePackage;
    error?: string;
};

/**
 * Fully JSON-serializable seal state. Replaces the previous non-serializable shape (which held live
 * process instances and a PaymentProvider). `secret` is sensitive and is cleared once status reaches
 * Sealed; while sealing it is retained so a resume needs no re-supply.
 */
export type SerializedSealingState = {
    version: number;
    status: NihiliumSealingStatus;
    // The vault private scalar, as a decimal string. Held only while sealing — a resume must seal the
    // SAME key, or the published vault public key would stop matching — and cleared on Sealed.
    secret?: string;
    // Published half of the vault keypair; kept after Sealed, since it is what the seal carries.
    vault_public_key?: VaultPublicKey;
    // Free-form, JSON-serializable state owned by a scenario subclass (e.g. the ZKEmail sealing client
    // stores the blob it encrypted to the vault, so a resume re-embeds it instead of re-encrypting).
    scenario_state?: { [key: string]: any };
    metadata_root: string;                 // bigint as decimal string
    template_inputs: { [key: string]: any };
    data_stream_mapping: { [key: string]: string };
    shared_threshold: number;
    shared_search_width: number;
    unseal_condition_root?: string;        // recorded for a stable storage key across resumes
    per_processor: ProcessorSealRecord[];
    fdt_seal?: FDTSealedPackage;           // set once the threshold encryption is done
    seal?: NihiliumSeal;                   // final assembled seal
};

/**
 * Top-level phase of a NihiliumUnsealingClient unseal. Persisted so a reloaded client knows where to
 * resume. Unlike sealing, /request_unseal is never paid — resumability here avoids re-publishing
 * reveal values and re-running the local unseal ZK proofs, not re-charges.
 */
export enum NihiliumUnsealingStatus {
    Ready_to_unseal = "ready_to_unseal",
    Publishing_reveal_values = "publishing_reveal_values",
    Recovering_scalars = "recovering_scalars",
    Recovering_secret = "recovering_secret",
    Unsealed = "unsealed",
    Failed = "failed",
}

/** Per-processor sub-phase inside an unseal. */
export enum ProcessorUnsealPhase {
    Pending = "pending",    // not yet unsealed
    Unsealed = "unsealed",  // composite private scalar recovered
    Failed = "failed",
}

export type ProcessorUnsealRecord = {
    processor_index: number;
    phase: ProcessorUnsealPhase;
    // Recovered composite private scalar (discrete log of the package's constructed_public_key), as a
    // decimal string. Sensitive: k of these recover the secret; cleared once the secret is recovered.
    composite_scalar?: string;
    error?: string;
};

/**
 * Fully JSON-serializable unseal state. `secret` and the per-processor `composite_scalar`s are
 * sensitive and are cleared once status reaches Unsealed.
 */
export type SerializedUnsealingState = {
    version: number;
    status: NihiliumUnsealingStatus;
    processor_indices: number[];
    reveal_published: boolean;       // the batched reveal-value publication has been posted
    data_stream_id?: string;
    // Lower bound on the anchoring timestamp of the publication every opening proof in this unseal is
    // built from. Set when the reveal values are re-batched; unset means the earliest publication.
    // Persisted so a resume keeps producing proofs against the same round.
    from_timestamp?: number;
    // "Now" from a proving perspective, shared by all k processors: the block timestamp anchoring the
    // reveal values selected by `from_timestamp`. Resolved once, by waitForProvingTimestamp().
    proving_timestamp?: number;
    // Whether the reveal values have been re-batched already; bounds the automatic re-batch to one
    // attempt per unseal.
    republished?: boolean;
    per_processor: ProcessorUnsealRecord[];
    // Shared (produced-once) module proofs, keyed by module_id, reused across every processor. Persisted
    // so a crash never re-runs the expensive shared proof (e.g. ZKEmail) — the unseal analogue of the
    // seal client's never-recharge guarantee. Only modules NOT in perProcessorModuleIds land here.
    shared_proofs?: { [module_id: string]: ModuleProof };
    // Free-form, JSON-serializable state owned by a scenario subclass of NihiliumUnsealingClient (e.g. the
    // ZKEmail client stores its hash-tie preimage / email subject here). Persisted so a resume reuses the
    // same scenario setup instead of regenerating it. The base client never reads its contents.
    scenario_state?: { [key: string]: any };
    secret?: string;                 // recovered secret, bigint as decimal string; cleared on Unsealed
};

/**
 * Pluggable persistence for client state. Kept string-keyed and synchronous-or-async so a browser
 * localStorage store, an in-memory store, or a file/DB store can all satisfy it.
 */
export interface ClientStateStore<T> {
    save(key: string, state: T): void | Promise<void>;
    load(key: string): T | null | Promise<T | null>;
    clear(key: string): void | Promise<void>;
}

/** Process-local fallback store used when no browser localStorage is available (Node, tests). */
export class InMemoryClientStateStore<T> implements ClientStateStore<T> {
    private readonly map = new Map<string, string>();
    save(key: string, state: T): void {
        this.map.set(key, JSON.stringify(state));
    }
    load(key: string): T | null {
        const raw = this.map.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
    }
    clear(key: string): void {
        this.map.delete(key);
    }
}

/** Browser store backed by window.localStorage. */
export class LocalStorageClientStateStore<T> implements ClientStateStore<T> {
    save(key: string, state: T): void {
        window.localStorage.setItem(key, JSON.stringify(state));
    }
    load(key: string): T | null {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    }
    clear(key: string): void {
        window.localStorage.removeItem(key);
    }
}

/** localStorage in the browser, an in-memory store otherwise. */
export function defaultClientStateStore<T>(): ClientStateStore<T> {
    try {
        if (typeof window !== "undefined" && window.localStorage !== undefined) {
            return new LocalStorageClientStateStore<T>();
        }
    } catch {
        /* accessing window/localStorage can throw in sandboxed contexts */
    }
    return new InMemoryClientStateStore<T>();
}

// --- Sealing store (typed views over the generic store; export names unchanged) ---
export type SealingStateStore = ClientStateStore<SerializedSealingState>;
export class InMemorySealingStateStore extends InMemoryClientStateStore<SerializedSealingState> {}
export class LocalStorageSealingStateStore extends LocalStorageClientStateStore<SerializedSealingState> {}
export function defaultSealingStateStore(): SealingStateStore {
    return defaultClientStateStore<SerializedSealingState>();
}

// --- Unsealing store ---
export type UnsealingStateStore = ClientStateStore<SerializedUnsealingState>;
export class InMemoryUnsealingStateStore extends InMemoryClientStateStore<SerializedUnsealingState> {}
export class LocalStorageUnsealingStateStore extends LocalStorageClientStateStore<SerializedUnsealingState> {}
export function defaultUnsealingStateStore(): UnsealingStateStore {
    return defaultClientStateStore<SerializedUnsealingState>();
}
