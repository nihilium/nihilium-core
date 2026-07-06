import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { wasm } from '@rollup/plugin-wasm';

export default {
  input: 'src/index.browser.ts',
  output: {
    dir: 'dist/browser',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [
    resolve({ 
      browser: true, 
      preferBuiltins: false,
      mainFields: ['browser', 'module', 'main'],
      // Force browser builds for these packages
      alias: {
        '@aztec/bb.js': '@aztec/bb.js/dest/browser/index.js',
        '@noir-lang/noir_js': '@noir-lang/noir_js/lib/index.mjs',
        '@noir-lang/acvm_js': '@noir-lang/acvm_js/web/acvm_js.js',
        '@noir-lang/noirc_abi': '@noir-lang/noirc_abi/web/noirc_abi_wasm.js'
      }
    }),
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream']
    }),
    wasm({ targetEnv: 'auto' }),
    commonjs({
      // Don't transform Node.js modules
      ignore: [
        'fs', 'fs/promises', 'path', 'os', 'util', 'events', 'querystring', 'url', 
        'http', 'https', 'net', 'tls', 'zlib', 'assert', 'constants', 'domain', 
        'punycode', 'string_decoder', 'timers', 'tty', 'vm', 'v8', 'inspector', 
        'perf_hooks', 'trace_events', 'async_hooks', 'child_process', 'cluster', 
        'dgram', 'dns', 'module', 'readline', 'repl', 'sys', 'wasi', 'webstreams',
        'worker_threads', 'stream/promises'
      ],
    }),
    typescript({ tsconfig: './tsconfig.browser.json' }),
    json()
  ],
  // Make Node.js modules external
  external: [
    'fs', 'fs/promises', 'path', 'os', 'util', 'events', 'querystring', 'url', 
    'http', 'https', 'net', 'tls', 'zlib', 'assert', 'constants', 'domain', 
    'punycode', 'string_decoder', 'timers', 'tty', 'vm', 'v8', 'inspector', 
    'perf_hooks', 'trace_events', 'async_hooks', 'child_process', 'cluster', 
    'dgram', 'dns', 'module', 'readline', 'repl', 'sys', 'wasi', 'webstreams',
    'worker_threads', 'stream/promises'
  ]
};