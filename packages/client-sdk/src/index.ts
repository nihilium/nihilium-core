/**
 * Browser entry — the package's `browser` and `default` export condition.
 *
 * Everything real lives in `./common_index`; this file exists so the browser and Node builds have
 * symmetric entry points, matching the layout of @nihilium/core (`index.ts` / `index.browser.ts` /
 * `common_index.ts`).
 *
 * There is deliberately nothing browser-only to add today. The server surface is the only thing
 * that differs, and it belongs to Node alone — see `index.node.ts`.
 */
export * from './common_index';
