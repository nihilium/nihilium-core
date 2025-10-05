# Circuit Upload Script

This script uploads circom circuit files to IPFS via Pinata.

## Setup

1. Copy `.env.example` to `.env` in the `packages/zkp-circuits` directory:
   ```bash
   cp .env.example .env
   ```

2. Add your Pinata API credentials to `.env`:
   ```
   PINATA_API_KEY=your_actual_api_key
   PINATA_SECRET_API_KEY=your_actual_secret_api_key
   ```

## Usage

### Direct execution:
```bash
node scripts/upload_to_pinata.js <circuit_name>
```

### Using npm script:
```bash
npm run upload-to-pinata opening_proof
```

### Example:
```bash
node scripts/upload_to_pinata.js opening_proof
```

## What it does

The script will:

1. Read circuit files from `circom-circuits/build/<circuit_name>/`
2. Upload the following files to Pinata with standardized names:
   - `groth16_verifier.sol` → `verifier.sol`
   - `groth16_vkey.json` → `vkey.json`
   - `groth16_pkey.zkey` → `zkey.zkey`
   - `<circuit_name>_js/<circuit_name>.wasm` → `wasm.wasm`
3. Generate a JSON file in `src/ipfsrefs/<circuit_name>.json` with the IPFS hashes

## Output

The script outputs a JSON file like:

```json
{
  "circuitName": "opening_proof",
  "files": {
    "verifier.sol": "QmXxx...",
    "vkey.json": "QmYyy...",
    "zkey.zkey": "QmZzz...",
    "wasm.wasm": "QmAaa..."
  }
}
```

Each file can be accessed via:
- IPFS gateway: `https://gateway.pinata.cloud/ipfs/<hash>`
- Direct IPFS: `ipfs://<hash>`

## Notes

- The script requires the circuit to be built first using `npm run build-circom-circuits`
- Large files (like .zkey) may take several minutes to upload
- The IPFS CIDs are in CIDv0 format by default (starting with "Qm")
