export type RuntimeEnv = 'node' | 'browser';
export declare function detectEnvironment(): RuntimeEnv;
/**
 * Resolve a path/URL relative to *this module* so bundlers emit assets.
 * - If the user passes an http(s)/data/blob URL, we keep it as-is.
 * - If they pass a relative path (e.g. './circuits/foo.wasm'), we turn it into:
 *   - Browser: an http URL (string) pointing at the emitted asset
 *   - Node: a filesystem path (string) to the emitted file in node_modules
 */
export declare function resolvePath(userPath: string, env: RuntimeEnv): Promise<string>;
export declare function loadAsArrayBuffer(resolved: string): Promise<ArrayBuffer>;
export declare function loadWasm(_resolvedPath: string, _env: RuntimeEnv): Promise<WebAssembly.Module | null>;
export declare function loadZKey(_resolvedPath: string, _env: RuntimeEnv): Promise<unknown>;
export declare function loadVKey(resolvedPath: string, env: RuntimeEnv): Promise<any>;
