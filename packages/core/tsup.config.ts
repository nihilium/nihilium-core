import { defineConfig } from 'tsup';

// Two entries, two runtimes. src/index.ts pulls Processor -> @nihilium/dlog-solver-rs,
// a native napi addon that cannot run in a browser; src/index.browser.ts stubs it out.
// Building them separately is what lets each entry ship types that match its runtime.
//
// Dependencies stay external (tsup's default): node consumers need normal resolution and
// dedup, and client-sdk's bundler inlines core exactly once from the browser entry.
export default defineConfig([
  {
    name: 'node',
    entry: { index: 'src/index.ts' },
    outDir: 'dist/node',
    format: ['cjs', 'esm'],
    platform: 'node',
    target: 'node20',
    dts: true,
    sourcemap: true,
    splitting: false,
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
  },
  {
    name: 'browser',
    entry: { index: 'src/index.browser.ts' },
    outDir: 'dist/browser',
    format: ['esm'],
    platform: 'browser',
    target: 'es2020',
    dts: true,
    sourcemap: true,
    splitting: false,
    outExtension: () => ({ js: '.mjs' }),
  },
]);
