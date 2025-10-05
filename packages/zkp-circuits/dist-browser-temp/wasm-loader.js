// Works in both Node and the browser
export function detectEnvironment() {
    // Avoid false positives in edge runtimes
    return (typeof process !== 'undefined' && process.versions?.node) ? 'node' : 'browser';
}
function isHttpLike(p) {
    return /^https?:\/\//i.test(p);
}
function isDataOrBlob(p) {
    return /^(data:|blob:)/i.test(p);
}
function isAbsFsPath(p) {
    // Extremely conservative; library consumers shouldn’t need absolute FS paths
    return /^([/\\]|[A-Za-z]:[/\\])/.test(p);
}
/**
 * Resolve a path/URL relative to *this module* so bundlers emit assets.
 * - If the user passes an http(s)/data/blob URL, we keep it as-is.
 * - If they pass a relative path (e.g. './circuits/foo.wasm'), we turn it into:
 *   - Browser: an http URL (string) pointing at the emitted asset
 *   - Node: a filesystem path (string) to the emitted file in node_modules
 */
export async function resolvePath(userPath, env) {
    if (!userPath)
        throw new Error('Empty path');
    if (isHttpLike(userPath) || isDataOrBlob(userPath) || isAbsFsPath(userPath)) {
        // Respect fully-qualified inputs
        return userPath;
    }
    // Let the bundler rewrite this to the final emitted asset URL:
    // IMPORTANT: the second argument is *this file’s* URL, not the caller’s CWD.
    const url = userPath; //new URL(userPath, import.meta.url);
    if (env === 'node') {
        // Node prefers a real path (snarkjs accepts path or URL, but path is safest)
        const { fileURLToPath } = await import('node:url'); // dynamic, Node-only
        return fileURLToPath(url);
    }
    return url.toString(); // e.g. /assets/foo-abc123.wasm
}
// Optional helpers. If you *really* need to prefetch bytes:
export async function loadAsArrayBuffer(resolved) {
    if (detectEnvironment() === 'browser' && !isAbsFsPath(resolved)) {
        const r = await fetch(resolved);
        if (!r.ok)
            throw new Error(`Fetch failed ${r.status} for ${resolved}`);
        return await r.arrayBuffer();
    }
    else {
        const { readFile } = await import('fs/promises'); // Remove 'node:' prefix
        const buf = await readFile(resolved);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
}
// Shims (snarkjs.groth16.fullProve accepts path/URL; you typically don’t need to “load” first)
export async function loadWasm(_resolvedPath, _env) {
    // Keep API compatibility with your existing class; return null to indicate “no pre-init”.
    return null;
}
export async function loadZKey(_resolvedPath, _env) {
    return {}; // Placeholder to keep your class logic intact
}
export async function loadVKey(resolvedPath, env) {
    // vkey is JSON; we *do* need to read it for verify()
    if (env === 'browser' && !isAbsFsPath(resolvedPath)) {
        const r = await fetch(resolvedPath);
        if (!r.ok)
            throw new Error(`Failed to fetch vkey: ${r.status}`);
        return await r.json();
    }
    else {
        const { readFile } = await import('node:fs/promises');
        const json = await readFile(resolvedPath, 'utf8');
        return JSON.parse(json);
    }
}
