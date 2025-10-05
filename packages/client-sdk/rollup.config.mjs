import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { wasm } from '@rollup/plugin-wasm';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [
    resolve({ 
      browser: true, 
      preferBuiltins: false,
      mainFields: ['browser', 'module', 'main'],
      alias: {
        'fs/promises': false,
        'stream/promises': false,
        'worker_threads': false,
        'fs': false,
        'path': false,
        'os': false,
        'util': false,
        'events': false,
        'querystring': false,
        'url': false,
        'http': false,
        'https': false,
        'net': false,
        'tls': false,
        'zlib': false,
        'assert': false,
        'constants': false,
        'domain': false,
        'punycode': false,
        'string_decoder': false,
        'timers': false,
        'tty': false,
        'vm': false,
        'v8': false,
        'inspector': false,
        'perf_hooks': false,
        'trace_events': false,
        'async_hooks': false,
        'child_process': false,
        'cluster': false,
        'dgram': false,
        'dns': false,
        'module': false,
        'readline': false,
        'repl': false,
        'string_decoder': false,
        'sys': false,
        'tty': false,
        'v8': false,
        'vm': false,
        'wasi': false,
        'webstreams': false,
        'node:fs': false,
        'node:path': false,
        'node:os': false,
        'node:util': false,
        'node:events': false,
        'node:querystring': false,
        'node:url': false,
        'node:http': false,
        'node:https': false,
        'node:net': false,
        'node:tls': false,
        'node:zlib': false,
        'node:assert': false,
        'node:constants': false,
        'node:domain': false,
        'node:punycode': false,
        'node:string_decoder': false,
        'node:timers': false,
        'node:tty': false,
        'node:vm': false,
        'node:v8': false,
        'node:inspector': false,
        'node:perf_hooks': false,
        'node:trace_events': false,
        'node:async_hooks': false,
        'node:child_process': false,
        'node:cluster': false,
        'node:dgram': false,
        'node:dns': false,
        'node:module': false,
        'node:readline': false,
        'node:repl': false,
        'node:string_decoder': false,
        'node:sys': false,
        'node:tty': false,
        'node:v8': false,
        'node:vm': false,
        'node:wasi': false,
        'node:webstreams': false,
        // Fix the process/browser resolution
        'process/browser': 'process/browser.js',
        '@aztec/bb.js': '@aztec/bb.js/dest/browser/index.js',
        '@noir-lang/acvm_js': '@noir-lang/acvm_js/web/acvm_js.js',
        '@noir-lang/noirc_abi': '@noir-lang/noirc_abi/web/noirc_abi_wasm.js'
      }
    }),
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream']
    }),
    wasm({ targetEnv: 'auto' }),
    commonjs({
      ignore: [
        'fs/promises', 'stream/promises', 'worker_threads',
        'fs', 'path', 'os', 'util', 'events', 'querystring', 'url', 'http', 'https', 'net', 'tls', 'zlib',
        'assert', 'constants', 'domain', 'punycode', 'string_decoder', 'timers', 'tty', 'vm', 'v8',
        'inspector', 'perf_hooks', 'trace_events', 'async_hooks', 'child_process', 'cluster', 'dgram',
        'dns', 'module', 'readline', 'repl', 'string_decoder', 'sys', 'tty', 'v8', 'vm', 'wasi', 'webstreams'
      ]
    }),
    typescript({ tsconfig: './tsconfig.json' }),
    json()
  ],
  external: [
    'fs/promises', 'stream/promises', 'worker_threads',
    'fs', 'path', 'os', 'util', 'events', 'querystring', 'url', 'http', 'https', 'net', 'tls', 'zlib',
    'assert', 'constants', 'domain', 'punycode', 'string_decoder', 'timers', 'tty', 'vm', 'v8',
    'inspector', 'perf_hooks', 'trace_events', 'async_hooks', 'child_process', 'cluster', 'dgram',
    'dns', 'module', 'readline', 'repl', 'string_decoder', 'sys', 'tty', 'v8', 'vm', 'wasi', 'webstreams'
  ]
};