// Build script for the registry-manager CLI.
//
// esbuild bundles src/index.ts and its entire dependency graph — including the
// workspace packages @nihilium/registry, @nihilium/core and @nihilium/zkp-circuits —
// into a single self-contained dist/cli.js. That inlining is what makes the
// published package installable/runnable with plain `npx nihilium-registry`:
// the tarball has zero runtime dependencies to resolve, so none of the
// unpublished `@nihilium/*` workspace links ever need to exist on the consumer.
//
// The entry file already carries a `#!/usr/bin/env node` shebang, which esbuild
// preserves at the top of the output, so no banner is added here.

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
  // Match the `engines.node` floor in package.json.
  target: "node20",
  format: "cjs",
  // platform:"node" keeps Node builtins external (always available at runtime)
  // while inlining every third-party and workspace package.
  legalComments: "none",
  logLevel: "info",
});

// Make the bundle directly executable so the `bin` entry works without a wrapper.
chmodSync(outfile, 0o755);

console.log(`Built ${outfile}`);
