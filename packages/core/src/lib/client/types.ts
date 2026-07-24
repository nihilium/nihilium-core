import { FDTSealedPackage } from "@nihilium/zkp-circuits";
import { NihiliumSeal, SingleSealRequestResponse, SingleSealStoragePackage } from "../../types/protocol/common";


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
    secret?: string;                       // bigint as decimal string; cleared on Sealed
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
    per_processor: ProcessorUnsealRecord[];
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
