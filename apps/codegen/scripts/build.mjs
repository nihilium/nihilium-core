// Build script for the @nihilium/codegen CLI.
//
// esbuild bundles src/index.ts and its whole dependency graph — including the workspace
// package @nihilium/core — into a single self-contained dist/cli.js, so the published
// package runs with plain `npx @nihilium/codegen` and none of the unpublished @nihilium/*
// workspace links need to exist on the consumer. The entry carries a `#!/usr/bin/env node`
// shebang which esbuild preserves.

import { build } from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "dist/cli.js");

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  // Resolve @nihilium/core to its BROWSER entry: codegen only needs the module library +
  // collection compilation (in common_index), and the browser entry provides those while
  // stubbing Processor — which keeps the native @nihilium/dlog-solver-rs .node addon (a
  // Node-only binary esbuild can't bundle) out of the graph entirely.
  conditions: ["browser"],
  legalComments: "none",
  logLevel: "info",
});

chmodSync(outfile, 0o755);

console.log(`Built ${outfile}`);
