import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// This package is the protocol's only public browser surface. It must be installable
// standalone: @nihilium/core and @nihilium/zkp-circuits are inlined here (they are
// unpublished internals), so nothing in dist/ may reference them at runtime OR in the
// type declarations. This config emits the JS bundle only; the self-contained .d.ts is
// produced separately by rollup.dts.config.mjs (rollup-plugin-dts), because that tool
// inlines every referenced type -- api-extractor insists on keeping npm deps external,
// which is wrong for a zero-dependency package.
export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  resolve: {
    // 'browser' first: @nihilium/core must resolve to its browser entry, whose
    // Processor/DataStream/Persistence are stubs and whose native dlog-solver-rs
    // addon is absent.
    conditions: ['browser', 'import', 'module', 'default'],
  },
  build: {
    lib: {
      // Two entries: the main SDK and the flat `types` subpath. Vite shares chunks
      // between them, so dist/types.mjs is a thin re-export of the common bundle.
      entry: { index: 'src/index.ts', types: 'src/types.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // poseidon-lite stays external (a declared runtime dep) so cryptoTools.poseidonTools
      // keeps its value namespace; everything else is inlined for a standalone tarball.
      external: ['poseidon-lite'],
    },
    chunkSizeWarningLimit: 100000,
  },
});
