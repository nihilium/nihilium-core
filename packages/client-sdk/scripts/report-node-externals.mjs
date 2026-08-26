/**
 * Report every bare specifier the Node build actually reaches for.
 *
 * The node build externalizes published dependencies by predicate rather than by a hand-written
 * list (see vite.config.node.mjs), which is the safe default -- a newly-added dependency is
 * externalized automatically. The risk that creates is the mirror image: an external the bundle
 * needs but package.json does not declare, which only fails at a consumer's install or first import.
 *
 * This closes that loop. Run it after `build:js:node` and reconcile against `dependencies`.
 * Node builtins are reported separately; they need no declaration.
 */
import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(packageRoot, "dist", "node");

// Static `from "x"` / `import "x"`, and dynamic `import("x")`.
//
// The character class excludes whitespace deliberately. Minified bundles contain long quoted
// strings that a greedy `[^"']+` will happily swallow across newlines, which turns this report into
// a dump of the bundle. A real module specifier has no whitespace and is at most 214 chars.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"'\s]{1,214})["']/g;

const packageOf = (id) => {
    const parts = id.split("/");
    return id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

let files;
try {
    files = (await readdir(outDir)).filter((f) => f.endsWith(".mjs") || f.endsWith(".js"));
} catch {
    console.error(`No ${outDir}. Run \`npm run build:js:node\` first.`);
    process.exit(1);
}

const found = new Set();
for (const file of files) {
    const source = await readFile(join(outDir, file), "utf8");
    for (const [, id] of source.matchAll(SPECIFIER)) {
        if (id.startsWith(".") || id.startsWith("/")) continue;
        found.add(packageOf(id));
    }
}

const builtins = new Set(builtinModules);
const isBuiltin = (n) => builtins.has(n) || n.startsWith("node:");

const external = [...found].filter((n) => !isBuiltin(n)).sort();
const usedBuiltins = [...found].filter(isBuiltin).sort();

const declared = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")).dependencies ?? {};
const missing = external.filter((n) => !(n in declared));
const unused = Object.keys(declared).filter((n) => !external.includes(n));

console.log("External packages the node build imports:");
for (const name of external) console.log(`  ${name}${name in declared ? "" : "   <-- NOT DECLARED"}`);
console.log(`\nNode builtins used: ${usedBuiltins.join(", ") || "(none)"}`);
// poseidon-lite is externalized by the *browser* build (vite.config.mjs) so that
// cryptoTools.poseidonTools keeps its value namespace, and is inlined here. It is therefore a real
// dependency of the package even though this build does not import it.
const EXPECTED_UNUSED = new Set(["poseidon-lite"]);
const surprising = unused.filter((n) => !EXPECTED_UNUSED.has(n));
if (surprising.length) {
    console.log(`\nDeclared but imported by neither build -- candidates for removal: ${surprising.join(", ")}`);
}

if (missing.length) {
    console.error(`\nFAIL: ${missing.length} undeclared dependency(ies): ${missing.join(", ")}`);
    process.exit(1);
}
console.log("\nOK: every external the node build imports is declared in dependencies.");
