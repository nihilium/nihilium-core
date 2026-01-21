const { defineConfig } = require('vite');
const wasm = require('vite-plugin-wasm');
const topLevelAwait = require('vite-plugin-top-level-await');
const { viteStaticCopy } = require('vite-plugin-static-copy');

module.exports = defineConfig({
   plugins: [
     wasm(),
     topLevelAwait(),
     viteStaticCopy({
        targets: [
          // {
          //   src: require.resolve('@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm'),
          //   dest: ''
          // },
          // {
          //   src: require.resolve('@noir-lang/acvm_js/web/acvm_js_bg.wasm'),
          //   dest: ''
          // }
        ]
      })
   ],
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    exclude: [
    //  '@noir-lang/noirc_abi',
    //  '@noir-lang/acvm_js'
    ]
  },
  resolve: {
    alias: {
      'fs/promises': './stubs/empty.js',
      fs: './stubs/empty.js'
    }
  },
  build: {
    lib: {
        entry: 'src/index.browser.ts', // your main entry
        name: 'NoirLib',
        fileName: (format) => `index.${format}.js`
      },
    target: 'esnext',
    outDir: 'dist/browser',
  },
}); 