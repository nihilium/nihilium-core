import { dts } from 'rollup-plugin-dts';
import { nodeResolve } from '@rollup/plugin-node-resolve';

// Produce self-contained .d.ts files with zero @nihilium/* (or any bare) imports except
// poseidon-lite (a declared runtime dep). node-resolve is given the 'browser' + 'types'
// conditions so @nihilium/core resolves to its browser stub declarations
// (index.browser.d.ts) -- matching the browser runtime this SDK bundles, where
// Processor/DataStream/Persistence are stubs. respectExternal follows into and inlines
// external .d.ts files rather than leaving bare imports behind.
//
// poseidon-lite stays external: it is re-exposed as `cryptoTools.poseidonTools` via a
// nested `export * as poseidonTools from "poseidon-lite"`; inlining flattens it to a
// type-only alias and breaks `cryptoTools.poseidonTools` at the use site.
//
// rollup-plugin-dts follows modules via TypeScript's resolver, which does not honor the
// 'browser' export condition -- the `paths` map forces core's browser declarations (and
// the flat types barrel) so the emitted types match the runtime.
const shared = {
  external: ['poseidon-lite'],
  plugins: [
    nodeResolve({
      extensions: ['.d.ts', '.ts', '.mjs', '.js'],
      exportConditions: ['types', 'browser', 'import', 'module', 'default'],
    }),
    dts({
      respectExternal: true,
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@nihilium/core': ['../core/dist/index.browser.d.ts'],
          '@nihilium/core/types': ['../core/dist/types/public.d.ts'],
        },
      },
    }),
  ],
};

export default [
  { input: 'src/index.ts', output: { file: 'dist/index.d.ts', format: 'es' }, ...shared },
  { input: 'src/types.ts', output: { file: 'dist/types.d.ts', format: 'es' }, ...shared },
];
