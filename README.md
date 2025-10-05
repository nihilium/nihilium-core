# Privacy Accounts

A privacy-preserving computation system built with zero-knowledge proofs using Circom and Noir circuits. This monorepo contains packages for ZKP circuits, privacy libraries, client SDKs, and server applications.

## Repository Structure

This is an **NPM workspaces monorepo** with the following main components:

### 📦 Packages

#### **`packages/zkp-circuits`** - [@nihilium/zkp-circuits]
Zero-knowledge proof circuits implementation with dual circuit support:

- **Noir Circuits**: Modern ZKP circuits using the Noir language
  - `encrypt_proof` - Homomorphic encryption proofs  
  - `generic_tree_proof` - Generic Merkle tree membership proofs
  - `top_level_merkle_proof` - Top-level tree proofs with timestamp validation
  - `sub_tree_merkle_proof` - Sub-tree membership proofs
  - `validated_sig_he_add` - Signature validation with homomorphic addition
  - `generic_adjacent_tree_proof` - Adjacent tree proofs

- **Circom Circuits**: Legacy circuits for specific operations
  - `encrypt.circom` - Elliptic curve based homomorphic encryption
  - `validated_sig_he_add.circom` - Opening proofs with signature validation

- **Features**:
  - TypeScript wrappers for all circuits
  - Automated Solidity verifier generation
  - 19-bit lookup table for efficient discrete logarithm solving (~45MB)
  - Support for both browser and Node.js environments

#### **`packages/privacy-lib`** - [@nihilium/privacy-lib]
Core privacy library providing all protocol functionality:

- **Data Streams**: EVMDataStreamNonZK for blockchain data management
- **Persistence**: File-based and custom persistence layers  
- **Processors**: Server-side processing logic
- **Contract Wrappers**: Smart contract interaction utilities
- **Crypto Tools**: Encryption, decryption, and proof generation
- **Client Operations**: Sealing/unsealing processes

Supports both browser and Node.js environments without handling communication layers.

The main test to run all functionality without any additional software is `packages/privacy-lib/test/full.test.ts`

#### **`packages/client-sdk`** - [@nihilium/client-sdk] 
Browser-focused SDK that wraps the privacy library:

- Lightweight wrapper around `@nihilium/privacy-lib`
- Optimized for browser usage
- Handles endpoint selection and client-side operations
- Built with Vite for modern bundling

TODO: this should be published to NPM

### 🚀 Applications

#### **`apps/datastream-server`**
[Is not managed by just Nihilium, in the future co-deployed with processors]
HTTP server for managing encrypted data streams:

- **Purpose**: Provides REST API for data stream operations
- **Key Features**:
  - POST `/postData` - Submit encrypted data arrays
  - GET `/proof/:value` - Retrieve Merkle proofs for values
  - GET `/isProvable/:value` - Check if value can be proven
  - GET `/globalTreeIndex` - Get current tree state
  - GET `/latestGlobalLeafProof` - Get latest leaf proof (used for time proofs)

- **Configuration**: Via environment variables or CLI arguments
  - Private key for wallet operations
  - Contract address for the data stream
  - RPC URL for blockchain connection
  - Chain ID and port configuration

#### **`apps/processor`**
Processing server for seal/unseal operations:

- **Purpose**: Handles privacy-preserving data processing requests
- **Key Features**:
  - POST `/api/seal` - Process sealing requests  
  - POST `/api/unseal` - Process unsealing requests
  - GET `/api/public-keys` - Retrieve processor public keys
  - Homomorphic encryption operations
  - Unseal condition verification verification

- **Configuration**: Requires private keys for both standard and HE operations

#### **`apps/test-ui`**
React-based testing interface:

- **Purpose**: Frontend for testing and demonstrating the privacy system
- **Tech Stack**: React 18, Material-UI, TypeScript
- **Integration**: Uses `@nihilium/client-sdk` for privacy operations

### 🐳 Docker Support

The `docker/` directory contains:

- **Multi-service deployment** with docker-compose
- **Separate Dockerfiles** for datastream and processor services  
- **Environment configuration** templates
- **Volume management** for persistent data

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker (optional)

### Installation

```bash
# Install all dependencies
npm install

# Build only libraries
# Is a must before running the apps
npm run build-lib


```

### Development

```bash
# Run all services in development mode
npm run dev

# Build and watch for changes
npm run build:watch

# Run tests across all packages
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
  --chain-id=1337
```

#### Processor Server  
```bash
cd apps/processor
npm run dev -- \
  --private-key="YOUR_PRIVATE_KEY" \
  --private-key-he="YOUR_HE_PRIVATE_KEY" \
  --contract-address="CONTRACT_ADDRESS" \
  --rpc-url="RPC_URL"
```

#### Test UI
```bash
cd apps/test-ui
npm start
```

## Architecture

The system implements a privacy-preserving protocol with the following flow:

1. **Clients** use the SDK to encrypt and seal data
2. **Datastream servers** manage encrypted data and provide proofs  
3. **Processors** perform homomorphic operations on encrypted data
4. **ZKP circuits** ensure computation correctness without revealing data
5. **Smart contracts** verify proofs and manage on-chain state

## Key Features

- **Privacy-First**: All sensitive data remains encrypted throughout processing
- **Zero-Knowledge**: Proofs verify computation correctness without revealing inputs
- **Homomorphic Encryption**: Enables computation on encrypted data
- **Merkle Trees**: Efficient data integrity and membership proofs
- **Modular Design**: Each component can be deployed and scaled independently
- **Cross-Platform**: Supports both browser and server environments

## Contributing

This repository uses NPM workspaces for monorepo management. When making changes:

1. Use `npm run build-lib` for quick library builds during development
2. Run `npm run test` to ensure all packages pass tests across workspaces
3. Use conventional commit messages for automatic versioning

## License

[Add your license information here]