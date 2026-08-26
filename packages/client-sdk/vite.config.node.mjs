import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const src = (p) => fileURLToPath(new URL(p, import.meta.url));

// The Node build of the client SDK.
//
// The browser build (vite.config.mjs) inlines everything for a standalone tarball. This one does
// NOT: it inlines only @nihilium/* (which are unpublished, so there is no choice) and leaves every
// published dependency external, to be resolved from node_modules at runtime.
//
// That is the whole point. snarkjs' node entry spawns worker_threads and reads circuit files from
// disk; bundling it into a single ESM file re-plumbs that logic and breaks it. Leaving it external
// lets it run its own environment detection, which is the thing it is good at.
/**
 * Packages that must be **bundled** rather than externalized, because their ESM/CJS interop breaks
 * under Node's own resolver.
 *
 * Rollup emits ESM `import` syntax for externals, so Node has to infer named exports across a CJS
 * boundary with cjs-module-lexer. For these it infers wrongly:
 *
 *   - crypto-js, fixed-merkle-tree, poseidon-lite are CJS-only; a `fixed-merkle-tree` import came
 *     back as a non-constructor ("X0 is not a constructor").
 *   - @zk-kit/eddsa-poseidon is itself ESM, but its ESM build does
 *     `import { blake2bFinal } from "blakejs"` — a CJS package — and Node rejects that named
 *     import. `node -e "import('@zk-kit/eddsa-poseidon')"` fails on its own, with no bundler
 *     involved, so this is the package's bug and not something this build introduced.
 *
 * Bundling hands the interop to Vite's commonjs plugin, which gets it right. All four are pure
 * computation with no runtime environment behaviour, so nothing is lost — unlike snarkjs, which
 * must stay external precisely because it does spawn workers and read files.
 *
 * Determined empirically by importing every external under plain `node`; `npm run deps:node`
 * reports what the build reaches for. A new dependency that fails that import belongs here.
 */
const INLINE = [
    'crypto-js',
    'fixed-merkle-tree',
    'poseidon-lite',
    '@zk-kit/eddsa-poseidon',
    // The CJS package whose named exports @zk-kit/eddsa-poseidon fails to import; inlining the
    // dependent is only half the fix, since it then imports blakejs from our own bundle.
    'blakejs',
];

export default defineConfig({
  resolve: {
    // 'node' first, so snarkjs resolves to ./main.js rather than ./build/browser.esm.js. The
    // browser build creates its prover worker from a Blob -- `new Worker("blob:nodedata:...")` --
    // and Node's Worker accepts only file paths and data: URLs. That failure appears at fullProve,
    // never at import, so it is invisible to any test that does not actually prove.
    conditions: ['node', 'import', 'module', 'default'],
    alias: [
      // Order matters: the /types subpath must precede the bare package.
      { find: '@nihilium/core/types', replacement: src('../core/src/types/public.ts') },
      {
        // Source, not dist -- and specifically the *browser* source entry. Both prebuilt entries
        // are traps for a Node build:
        //   - dist/browser/index.browser.mjs already has snarkjs-browser inlined by core's own
        //     build, so re-bundling it keeps the Blob-Worker path this config exists to avoid.
        //   - dist/index.js (core's node build) exports the real Processor, which imports
        //     @nihilium/dlog-solver-rs -- an unpublished NAPI native addon. Anyone installing this
        //     package from npm could not resolve it.
        //
        // `index.browser.ts` is `common_index` plus stubs for Processor/DataStream/Persistence:
        // despite the name it is really "the client surface without the server pieces", which is
        // correct for a client SDK in any environment. It also keeps this build's runtime surface
        // identical to the browser build's, which is what lets both share one set of declarations.
        find: '@nihilium/core',
        replacement: src('../core/src/index.browser.ts'),
      },
      { find: '@nihilium/zkp-circuits', replacement: src('../zkp-circuits/src/index.ts') },
    ],
  },
  build: {
    lib: {
      entry: {
        index: 'src/index.node.ts',
        types: 'src/types.ts',
        server: 'src/server/index.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    target: 'node20',
    outDir: 'dist/node',
    // Wipes dist/node only, not dist -- so the browser build's output (which must be produced
    // first, since its own emptyOutDir wipes all of dist) survives. Leaving this false let stale
    // chunks from a previous build linger, which made `deps:node` report externals that the current
    // build had already inlined.
    emptyOutDir: true,
    rollupOptions: {
      // Inline our own source and @nihilium/*; externalize every other bare specifier. Expressed as
      // a predicate rather than a hand-written list so a newly-added dependency is externalized by
      // default -- the safe direction. `npm run deps:node` reports what the build actually reached
      // for, which is what package.json's dependencies must cover.
      external: (id) => {
        if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return false;
        if (id.startsWith('@nihilium/')) return false;
        if (INLINE.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))) return false;
        return true;
      },
      output: {
        preserveModules: false,
        // zkp-circuits/src/circom-wrapper.ts loads circuit files in Node through bare CJS
        // `require('fs' | 'path' | 'https' | 'http' | 'url')`, guarded by `typeof window ===
        // 'undefined'`. That branch is dead in the browser build and never ran; under Node it runs
        // and throws "require is not defined in ES module scope".
        //
        // Those modules are genuinely needed there -- it is how circuits are read from disk -- so
        // the branch cannot simply be compiled out. Supplying a real createRequire is the honest
        // accommodation, and it belongs in the build rather than in every consumer.
        //
        // The upstream fix is to make circom-wrapper use static `node:` imports; that is a change
        // to @nihilium/zkp-circuits and is proposed separately rather than made here.
        banner:
          "import { createRequire as __nihiliumCreateRequire } from 'node:module';\n" +
          "const require = __nihiliumCreateRequire(import.meta.url);\n",
      },
    },
    chunkSizeWarningLimit: 100000,
    sourcemap: true,
  },
});
