/**
 * Node entry — the package's `node` export condition.
 *
 * The client surface is identical to the browser's; what differs is how the bundle was built.
 * `vite.config.node.mjs` resolves `snarkjs` to its node entry (the browser one builds its prover
 * worker from a `Blob` URL, which Node cannot load) and leaves published dependencies external so
 * they run their own environment logic instead of being re-plumbed by a bundler.
 *
 * `./server` is re-exported here and NOT from `index.ts`: `NihiliumServerPayment` holds an API key,
 * so it must not be reachable from a browser bundle. It is also published as the `./server` subpath
 * for callers who want only that.
 */
export * from './common_index';
export * from './server';
