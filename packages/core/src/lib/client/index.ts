// Public surface of the Nihilium client SDK.

export { NihiliumSealingClient, NihiliumSealingStatus } from "./sealing_client";
export { NihiliumUnsealingClient, NihiliumUnsealingStatus } from "./unsealing_client";
export type { NihiliumUnsealingClientOptions, StartUnsealingOptions } from "./unsealing_client";
export {
    NihiliumEncryptionMode,
    ProcessorSealPhase,
    ProcessorUnsealPhase,
    InMemorySealingStateStore,
    LocalStorageSealingStateStore,
    defaultSealingStateStore,
    InMemoryUnsealingStateStore,
    LocalStorageUnsealingStateStore,
    defaultUnsealingStateStore,
    InMemoryClientStateStore,
    LocalStorageClientStateStore,
    defaultClientStateStore,
} from "./types";
export type {
    ProcessorSealRecord,
    SerializedSealingState,
    SealingStateStore,
    ProcessorUnsealRecord,
    SerializedUnsealingState,
    UnsealingStateStore,
    ClientStateStore,
} from "./types";

export { ClientSingleShareSealingProcess } from "./client_single_share_sealing";
export { ClientSingleShareUnsealingProcess } from "./client_single_share_unsealing";
export type { UnsealResolvers, UnsealResolver } from "./client_single_share_unsealing";

export {
    NihiliumPaymentProvider,
    NihiliumPaymentProviderUnauthenticated,
    NihiliumPaymentProviderClientAPIKEY_DO_NOT_USE,
    hashRequestBody,
} from "./payments";
export type { PaymentProvider } from "./payments";
