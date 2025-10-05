const webpack = require('webpack');

module.exports = function override(config) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    assert: require.resolve('assert'),
    buffer: require.resolve('buffer'),
    process: require.resolve('process/browser'),
    worker_threads: false,
    fs: false,
    path: false,
    os: false,
    util: false,
    events: false,
    querystring: false,
    url: false,
    http: false,
    https: false,
    net: false,
    tls: false,
    zlib: false,
    constants: false,
    domain: false,
    punycode: false,
    string_decoder: false,
    timers: false,
    tty: false,
    vm: false,
    v8: false,
    inspector: false,
    perf_hooks: false,
    trace_events: false,
    async_hooks: false,
    child_process: false,
    cluster: false,
    dgram: false,
    dns: false,
    module: false,
    readline: false,
    repl: false,
    string_decoder: false,
    sys: false,
    tty: false,
    v8: false,
    vm: false,
    wasi: false,
    webstreams: false,
  };
  
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
    new webpack.DefinePlugin({
        'global.global': 'globalThis',
        'global.globalThis': 'globalThis',
    }),
  ]);
  
  config.module.rules.unshift({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false, // disable the behavior
    },
  });

  config.module.rules.push({
    test: /\.wasm$/,
    type: 'asset/resource',
  });
  
  return config;
};