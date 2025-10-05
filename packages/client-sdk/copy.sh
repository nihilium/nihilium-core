#!/bin/bash
mkdir -p dist

# Copy acvm_js WASM file (browser version)
if [ -f "../../node_modules/@noir-lang/acvm_js/web/acvm_js_bg.wasm" ]; then
    cp "../../node_modules/@noir-lang/acvm_js/web/acvm_js_bg.wasm" dist/
fi

# Copy noirc_abi WASM file (browser version)
if [ -f "../../node_modules/@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm" ]; then
    cp "../../node_modules/@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm" dist/
fi

echo "Browser WASM files copied to dist/"
ls -la dist/*.wasm 2>/dev/null || echo "No WASM files found"