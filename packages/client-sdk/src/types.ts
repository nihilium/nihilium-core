/**
 * Flat type namespace for the client SDK: `import * as types from '@nihilium/client-sdk/types'`.
 *
 * Re-exports core's canonical flat domain surface (protocol / proof / module / collection /
 * crypto-primitive) and adds the SDK's own client-only types. Carries values (classes, enums,
 * functions) as well as types, so it is a real module, not a declaration-only entry.
 */
export * from '@nihilium/core/types';
export type { SelectableProcessor, SelectableDataStream } from './lib/types';
