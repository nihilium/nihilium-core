/**
 * Public type surface — the single flat namespace for all Nihilium domain types.
 *
 * Re-exports every protocol / proof / module / collection declaration so consumers can
 * reach them as `types.X`. These modules mix type aliases with the classes, enums and
 * functions they describe (e.g. BasicAddressMap, UnsealConditionCollection, the enums), so
 * this barrel carries values too — it is emitted as real JS, not types-only.
 */
export * from './protocol/common';
export * from '../lib/unseal_conditions/proofs/types';
export * from '../lib/unseal_conditions/modules/types';
export * from '../lib/unseal_conditions/collections/types';
export * from '../lib/unseal_conditions/collections/UnsealConditionCollection';
export * from '../lib/unseal_conditions/collections/UnsealConditionTemplate';

// Data-stream contracts are pure interfaces.
export type {
  IDataStream,
  IDualDataStream,
  ProofResult,
  LatestGlobalLeafProofResult,
  DualProofResult,
  DualLatestGlobalLeafProofResult,
} from '../lib/data_stream/types';

// Crypto primitive types (Keypair, PubKey, SnarkBigInt, …). type-only: the module's
// runtime values (babyJub, SNARK_FIELD_SIZE) already live on `cryptoTools`.
export type * from './index';
