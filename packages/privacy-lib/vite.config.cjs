import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import {nodePolyfills} from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills(),
    viteStaticCopy({
      targets: [
        {
          src: require.resolve('@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm'),
          dest: ''
        },
        {
          src: require.resolve('@noir-lang/acvm_js/web/acvm_js_bg.wasm'),
          dest: ''
        }
      ]
    })
  ],
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    exclude: [
      '@noir-lang/noirc_abi',
      '@noir-lang/acvm_js'
    ]
  },
  resolve: {
    alias: {
      fs: './stubs/empty.js',
    }
  },
  build: {
    lib: {
      entry: 'src/index.browser.ts', // browser entry point
      name: 'PrivacyLib',
      fileName: (format) => `index.${format}.js`
    },
    target: 'esnext',
    outDir: 'dist/browser',
    rollupOptions: {
      // Do NOT add @nihilium/zkp-circuits to external, so it will be bundled
      external: [],
    }
  },
}); 