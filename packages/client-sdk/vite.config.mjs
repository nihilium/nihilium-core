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
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Nothing external: the published tarball must stand alone.
      external: [],
    },
    chunkSizeWarningLimit: 100000,
  },
});
