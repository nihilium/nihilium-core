const { defineConfig } = require('vite');
const wasm = require('vite-plugin-wasm');
const topLevelAwait = require('vite-plugin-top-level-await');
const { viteStaticCopy } = require('vite-plugin-static-copy');
const { nodePolyfills } = require('vite-plugin-node-polyfills');

module.exports = defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      // Enable specific polyfills
      include: ['buffer', 'process', 'util', 'stream', 'events'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
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
     // '@noir-lang/acvm_js'
    ]
  },
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
    alias: {
      fs: './stubs/empty.js',
    }
  },
  build: {
    lib: {
      entry: 'src/index.ts', // browser entry point
      name: 'ClientSDK',
      fileName: (format) => `index.${format}.js`
    },
    target: 'esnext',
    outDir: 'dist/browser',
    rollupOptions: {
      // Bundle dependencies so they get polyfilled
      external: [],
      output: {
        // Reduce memory by not inlining everything
        manualChunks: undefined,
      }
    },
    // Increase memory limit
    chunkSizeWarningLimit: 100000,
  },
}); 