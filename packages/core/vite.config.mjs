import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.browser.ts'),
      name: 'PrivacyLib',
      fileName: 'index.browser',
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
        globals: {
          // Add any global variables if needed
        }
      }
    },
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@noir-lang/noirc_abi', '@noir-lang/acvm_js']
  },
  resolve: {
    alias: {
      // Force browser versions
      // '@aztec/bb.js': '@aztec/bb.js/dest/browser/index.js', // Commented out to fix Vite build error
      '@noir-lang/noir_js': '@noir-lang/noir_js/lib/index.mjs',
      '@noir-lang/acvm_js': '@noir-lang/acvm_js/web/acvm_js.js',
      '@noir-lang/noirc_abi': '@noir-lang/noirc_abi/web/noirc_abi_wasm.js'
    }
  },
  define: {
    global: 'globalThis'
  },
  // Handle WASM files
  assetsInclude: ['**/*.wasm']
});