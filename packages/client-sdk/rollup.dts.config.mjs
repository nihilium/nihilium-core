import { dts } from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';

// Produce ONE self-contained dist/index.d.ts with zero @nihilium/* (or any bare) imports.
// node-resolve is given the 'browser' + 'types' conditions so @nihilium/core resolves to
// its browser stub declarations (index.browser.d.ts) -- matching the browser runtime this
// SDK bundles, where Processor/DataStream/Persistence are stubs. respectExternal makes
// rollup-plugin-dts follow into and inline those external .d.ts files rather than leaving
// bare imports behind.
export default {
  input: 'src/index.ts',
  output: { file: 'dist/index.d.ts', format: 'es' },
  // poseidon-lite is re-exposed as `cryptoTools.poseidonTools` via a nested
  // `export * as poseidonTools from "poseidon-lite"`. Inlining it flattens the namespace
  // into a TYPE-only alias, so `typeof cryptoTools` loses `poseidonTools` and real usage
  // (nhsdk.cryptoTools.poseidonTools.poseidon1) errors. Keeping poseidon-lite external
  // preserves it as a value namespace; it is a published package declared as a dependency.
  external: ['poseidon-lite'],
  plugins: [
    nodeResolve({
      extensions: ['.d.ts', '.ts', '.mjs', '.js'],
      exportConditions: ['types', 'browser', 'import', 'module', 'default'],
    }),
    // rollup-plugin-dts follows modules via TypeScript's resolver, which does not honor
    // the 'browser' export condition -- left alone it would inline core's NODE types
    // (Processor as a real class) while the runtime bundle ships the browser stub. The
    // paths mapping forces core's browser declarations so the types match the runtime.
    dts({
      respectExternal: true,
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@nihilium/core': ['../core/dist/index.browser.d.ts'],
        },
      },
    }),
  ],
};
