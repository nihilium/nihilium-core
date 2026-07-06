

# DISCLAIMER
This repo is a product of almost 7 years of trial and error and thus has artifacts of such endeavour.
- some namings are still odd due to a history of concept changes
- some tests are not working or hold old code reference
- not every package works outright
- Noir code is of an older iteration of the protocol, but still largely aligned, no longer used.


However, it does show the code that produces the results from the paper. 
If you want a walkthrough, contact us, we are actively looking for capable people willing to solve a big problem.


What still needs to be done:
- Processor and datastream registry + slashing
- Combinational Threshold integration in the sealing phase, current implementation and tests are mostly on a single processor.
- Massive cleanup

A demo application (password recovery) using the protocol can be found here:
https://recovery.nihilium.io

# Manual relevant locations

The core circuit can be found in: /packages/zkp-circuits/circom-circuits/circuits/nihilium_core.circom
  
The combinational threshold encryption can be found here: /packages/zkp-circuits/src/utils/dte.ts

Starting point for full circle test is: /packages/privacy-lib/test/full.test.ts

Note to the above: there is still a lot of mentions of shamir, this was origanlly used and to be implemented in the client-sdk. As the combinational threshold encryption became integeral to the core protocol this is now moved into the privacy. Leaving the client SDK quite empty.

# Nihilium Core

A privacy-preserving computation system built with zero-knowledge proofs. Data is encrypted using homomorphic encryption on the Baby Jubjub curve, stored in on-chain Merkle trees, and unlocked only when configurable unseal conditions are satisfied — all verified via ZKP circuits written in Circom (Groth16).

## Repository Structure

This is an **NPM workspaces monorepo** (`privacy-accounts`) with four packages and three applications.

### Packages

#### `packages/zkp-circuits` — `@nihilium/zkp-circuits`

Zero-knowledge proof circuits with TypeScript wrappers.

**Circom circuits** (compiled with Circomkit, Groth16) — the active circuit path:

| Circuit | File(s) | Purpose |
|---|---|---|
| `opening_proof` | `encrypt.circom` + `validated_sig_he_add.circom` | Elliptic-curve homomorphic encryption opening proof |
| `hash_tie` | `HashTie.circom` | Hash binding proof |

The core circuit is `circom-circuits/circuits/nihilium_core.circom`. The build pipeline generates Solidity verifier contracts (placed in `packages/privacy-lib/contracts/proofs/`) and TypeScript bindings. Circuit artifacts for Circom proofs are pinned to IPFS for browser usage.

**Noir circuits** (`noir-circuits/`) — older protocol iteration, kept for reference but no longer the primary path:

`encrypt_proof`, `generic_tree_proof`, `top_level_merkle_proof`, `sub_tree_merkle_proof`, `validated_sig_he_add`, `generic_adjacent_tree_proof`, `data_stream_roots_proof`, `mimc_test`

Also exports `cryptoTools` (Baby Jubjub utilities, key formatting, random number generation) and a `precompute` helper for lookup-table based discrete-log solving. The combinational threshold encryption (DTE) lives in `src/utils/dte.ts`.

#### `packages/dlog-solver-rs` — `@nihilium/dlog-solver-rs`

High-performance discrete logarithm solver for the Baby Jubjub curve, implemented in **Rust** and exposed to Node.js via **NAPI-RS**.

- Uses precomputed lookup tables (e.g. `x19xlookupTable.json`) for baby-step giant-step solving
- Curve parameters: a=168700, d=168696 (twisted Edwards, BN254 base field)
- Required by the privacy-lib for decrypting homomorphically encrypted values

#### `packages/privacy-lib` — `@nihilium/core`

Core protocol library covering data streams, processors, and client interactions. Built with Hardhat (Solidity 0.8.27, Cancun EVM) and TypeScript.

**Smart Contracts** (in `contracts/`):

| Contract | Purpose |
|---|---|
| `EmpheralMerkleTreeKeccak` | On-chain balanced Merkle tree with timestamped leaf insertion |
| `ChainedProofV2` | Generic chained proof verification engine |
| `NihiliumRecoveryRegister` | Recovery key registration |
| `Interfaces` (`IVerifier`, `IDataStream`) | Shared interfaces for verifiers and data streams |
| `proofs/*` (20 contracts) | Individual proof verifiers: `opening_proof`, `encrypt_proof`, `hash_tie`, `MerkleTreeProof`, `TopLevelMerkleProof`, `KeccakTreeEntry`, `KeccakPreImage`, `SmallerThan`, `GreaterOrEqualThen`, `Between`, `TimeDelayProof`, `ManualChoice`, `VerifyECDSA`, `VerifyEDDSA`, `AdditionProof`, `ValueInjection`, `Poseidon2`, `TestVerifyAlwaysTrue`, `IVerifier` |

**Source modules** (in `src/lib/`):

- **`data_stream/`** — `EVMDataStreamNonZK` (server-side stream management), `DataStreamClient` (HTTP client for querying proofs), `EVMDataStreamWatcher`
- **`persistence/`** — `DataStreamFilePersistence` for file-based Merkle tree state
- **`processor/`** — Server-side `Processor` class handling seal/unseal requests with homomorphic encryption
- **`contract_wrappers/`** — `ChainedProofWrapperV2`, `EmpheralMerkleTreeWrapper`, `LocalVMExecutor` (in-memory Hardhat EVM for testing)
- **`client/`** — `ClientSingleShareSealingProcess`, `ClientSingleShareUnsealingProcess`
- **`unseal_conditions/`** — Composable unseal condition system:
  - **Proofs** (13 standard + 2 ZK): opening, Merkle, top-level tree, keccak tree entry, smaller-than, greater-or-equal, time delay, manual choice, EDDSA verify, ECDSA verify, addition, value injection, Poseidon2; plus ZK email and hash tie
  - **Modules** (17): before/after time, time delay, opening, inclusion proof, exclusion claim, adjacent data selection, hash preimage, hash tie, manual choice, value injection, verify ECDSA, verify EDDSA, ZKEmail; plus dummy stubs for ZKPassport
  - **Collections** — `UnsealConditionCollection` and `UnsealConditionTemplate` for composing modules into chained proof instructions
  - **Templates** — Pre-built templates (e.g. `reveal_only_template`)

**Network support**: Anvil (31337), Ganache (1337), Avalanche Fuji testnet (43113), and custom chains. Deployed contract addresses are tracked in `scripts/deployed-contracts-*.json`.

Supports both browser and Node.js environments. The main integration test is `packages/privacy-lib/test/full.test.ts`.

#### `packages/client-sdk` — `@nihilium/client-sdk`

Browser-focused SDK wrapping `@nihilium/core`:

- Re-exports the full privacy-lib API
- Adds endpoint selection (`getDatastreams`, `getProcessors`, `getProcessorEndpoint`)
- Provides high-level helpers: `getDefaultSealingProcess`, `getDefaultUnsealingProcess`, `preload_circuits`
- Built with Vite for browser bundling

### Applications

#### `apps/datastream-server`

Express HTTP server managing an encrypted data stream backed by `EVMDataStreamNonZK`.

| Endpoint | Method | Description |
|---|---|---|
| `/postData` | POST | Submit an array of encrypted data hex strings |
| `/proof/:value` | GET | Retrieve global + local Merkle proofs for a value |
| `/isProvable/:value` | GET | Check if a value exists in the tree |
| `/globalTreeIndex` | GET | Current global tree index |
| `/latestGlobalLeafProof` | GET | Latest global leaf proof (used for time proofs) |
| `/address` | GET | Data stream contract address |
| `/identity` | GET | Server identity (address, chain ID, public keys) |
| `/health` | GET | Health check |

Configured via CLI flags (`--private-key`, `--contract-address`, `--rpc-url`, `--chain-id`, `--port`) or environment variables. Default port: **3006**.

#### `apps/processor`

Express HTTP server performing seal/unseal operations via the `Processor` class.

| Endpoint | Method | Description |
|---|---|---|
| `/get_public_keys` | GET | Processor's signing and HE public keys |
| `/identity` | GET | Processor identity (chained proof address, chain ID, keys) |
| `/request_seal` | POST | Process a sealing request |
| `/request_unseal` | POST | Process an unsealing request (10 MB body limit) |
| `/status` | GET | API status check |
| `/health` | GET | Health check |

Configured via CLI flags (`--private-key-signing`, `--private-key-private-he`, `--rpc-url`, `--chain-id`, `--port`) or environment variables. Default port: **3005**.

#### `apps/test-ui`

React 18 testing interface built with Material-UI and `@nihilium/client-sdk`. Used for demonstrating and testing the end-to-end privacy flow in the browser.

### Docker

The `docker/` directory provides Docker Compose configurations for both services:

- `Dockerfile.datastream` / `docker-compose.datastream.yml` — builds and runs the datastream server with persistent volume for stream data; env vars: `PRIVATE_KEY`, `CONTRACT_ADDRESS`, `RPC_URL`, `CHAIN_ID`
- `Dockerfile.processor` / `docker-compose.processor.yml` — builds and runs the processor server; env vars: `PRIVATE_KEY`, `PRIVATE_KEY_HE`, `CHAINED_PROOF_CONTRACT_ADDRESS`, `RPC_URL`, `CHAIN_ID`, `OPENING_PROOF_ADDRESS`
- Both services expose port **3006**, include health checks, and run as non-root users

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Rust** (stable) — for building `dlog-solver-rs`
- **Circomkit** / **snarkjs** — for compiling Circom circuits (optional, pre-compiled artifacts included)
- **Nargo** / **Barretenberg (`bb`)** — only needed to recompile the legacy Noir circuits
- **Docker** (optional) — for containerised deployment

### Installation

```bash
# Install all workspace dependencies
npm install

# Build the Rust dlog-solver (requires Rust toolchain)
cd packages/dlog-solver-rs && npm run build && cd ../..

# Build all libraries (zkp-circuits → privacy-lib → client-sdk)
npm run build-lib
```

### Running Tests

```bash
# Run the main integration test (requires a local Hardhat/Anvil node)
cd packages/privacy-lib
npm run start-anvil          # in a separate terminal
npm run deploy-static-anvil  # deploy contracts
npm run test-circuits        # run full.test.ts

# Run unit tests across all workspaces
npm run test
```

### Running Services

#### Datastream Server
```bash
cd apps/datastream-server
npm run dev -- \
  --private-key="YOUR_PRIVATE_KEY" \
  --contract-address="CONTRACT_ADDRESS" \
  --rpc-url="RPC_URL" \
  --chain-id=31337
```

#### Processor Server
```bash
cd apps/processor
npm run dev -- \
  --private-key-signing="YOUR_SIGNING_KEY" \
  --private-key-private-he="YOUR_HE_PRIVATE_KEY" \
  --rpc-url="RPC_URL" \
  --chain-id=31337
```

#### Test UI
```bash
cd apps/test-ui
npm start
```

## Architecture

```
┌─────────────┐    seal/unseal     ┌─────────────┐    on-chain verify    ┌──────────────────┐
│  Client SDK │◄──────────────────►│  Processor   │◄────────────────────►│  Smart Contracts │
│  (browser)  │                    │  (Express)   │                      │  (EVM)           │
└──────┬──────┘                    └──────────────┘                      │                  │
       │                                                                 │  ChainedProofV2  │
       │  proofs                   ┌──────────────┐    post/query        │  EmpheralMerkle  │
       └──────────────────────────►│  Datastream   │◄──────────────────►│  Proof Verifiers │
                                   │  Server       │                     └──────────────────┘
                                   └──────────────┘
```

1. **Clients** use the SDK to create unseal condition templates, encrypt data via homomorphic encryption, and initiate seal/unseal flows
2. **Datastream servers** manage encrypted data in on-chain Merkle trees and serve membership proofs over HTTP
3. **Processors** hold HE private keys, perform homomorphic operations, verify chained proofs, and execute seal/unseal logic
4. **ZKP circuits** (Circom/Groth16) prove encryption correctness, tree membership, and various unseal conditions without revealing plaintext
5. **Smart contracts** verify proofs on-chain via `ChainedProofV2` and individual proof verifier contracts

## Key Technologies

- **Circom** (Groth16/snarkjs) — active ZKP circuit language for opening proofs and hash ties
- **Noir** (Barretenberg backend) — older circuit iteration, kept for reference
- **Baby Jubjub** — elliptic curve for homomorphic encryption (twisted Edwards, BN254 base field)
- **Hardhat** — Solidity compilation, testing, and deployment
- **ethers.js v6** — blockchain interaction
- **Express** — HTTP servers for datastream and processor
- **NAPI-RS** — Rust ↔ Node.js bridge for performance-critical crypto
- **Vite** — browser builds for zkp-circuits, privacy-lib, and client-sdk

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
