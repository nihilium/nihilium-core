import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'dist/index.js'),
      name: 'NoirCircuits',
      fileName: 'index',
      formats: ['es']
    },
    outDir: 'dist/browser',
    sourcemap: true,
    rollupOptions: {
      external: [
        'fs', 'fs/promises', 'path', 'os', 'util', 'events', 'querystring', 'url', 
        'http', 'https', 'net', 'tls', 'zlib', 'assert', 'constants', 'domain', 
        'punycode', 'string_decoder', 'timers', 'tty', 'vm', 'v8', 'inspector', 
        'perf_hooks', 'trace_events', 'async_hooks', 'child_process', 'cluster', 
        'dgram', 'dns', 'module', 'readline', 'repl', 'sys', 'wasi', 'webstreams',
        'worker_threads', 'stream/promises'
      ],
      output: {
        globals: {}
      }
    },
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@noir-lang/noirc_abi', '@noir-lang/acvm_js']
  },
  resolve: {
    alias: {
      // Browser-specific aliases commented out to fix Vite build errors
      // '@aztec/bb.js': '@aztec/bb.js/dest/browser/index.js',
      // '@noir-lang/noir_js': '@noir-lang/noir_js/lib/index.mjs',
      // '@noir-lang/acvm_js': '@noir-lang/acvm_js/web/acvm_js.js',
      // '@noir-lang/noirc_abi': '@noir-lang/noirc_abi/web/noirc_abi_wasm.js'
    }
  },
  define: {
    global: 'globalThis'
  },
  // Handle WASM files
  assetsInclude: ['**/*.wasm'],
  // Add TypeScript support
  esbuild: {
    target: 'esnext'
  }
}); 