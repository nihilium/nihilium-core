# Nihilium Privacy Library - Rust Implementation Specification

**Version:** 1.0
**Target:** Rust translation of `@nihilium/privacy-lib` TypeScript library
**Purpose:** Complete specification for implementing privacy-preserving cryptographic protocols in Rust

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Medium-Level Architecture](#2-medium-level-architecture)
3. [Low-Level API Specification](#3-low-level-api-specification)
4. [Migration Notes: TypeScript to Rust](#4-migration-notes-typescript-to-rust)

---

## 1. High-Level Overview

### 1.1 Library Purpose

The Nihilium Privacy Library provides a complete toolkit for privacy-preserving cryptographic operations using zero-knowledge proofs (ZKPs), homomorphic encryption (HE), and blockchain integration. The library enables:

- **Secret Sealing**: Encrypt and commit secrets with conditional reveal mechanisms
- **Secret Unsealing**: Decrypt secrets when reveal conditions are satisfied
- **Data Streaming**: Maintain verifiable, timestamped data streams with Merkle tree proofs
- **Chained Proof Verification**: Build complex proof chains for conditional logic
- **Processor Coordination**: Client-server protocol for secure computation

### 1.2 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Privacy Library                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Crypto     │  │   Client     │  │  Processor   │      │
│  │   Tools      │  │   Sealing    │  │   Server     │      │
│  │              │  │   Unsealing  │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Data       │  │   Reveal     │  │  Contract    │      │
│  │   Stream     │  │   Methods    │  │  Wrappers    │      │
│  │              │  │   (ZK)       │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Persistence  │  │   Utils      │                         │
│  │              │  │   & Seals    │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Key Features

1. **Homomorphic Encryption (HE)**: ElGamal-style encryption on Baby Jubjub curve enabling additive operations
2. **EdDSA Signatures**: Poseidon hash-based signatures for ZK-friendly authentication
3. **Merkle Trees**: MiMC and Keccak hash-based trees for data commitment and proofs
4. **Chained Proofs**: Composable ZK proof verification with state management
5. **Data Streams**: Persistent, provable data publication with dual-tree architecture
6. **Severed Commitments**: Unlinkable commitments between sealing and unsealing

### 1.4 Cryptographic Primitives

- **Curves**: Baby Jubjub (alt_bn128 subgroup)
- **Hash Functions**: Poseidon (1, 2, 4 variants), MiMC-7, Keccak256
- **Encryption**: ECC (BabyJub), Homomorphic ElGamal
- **Signatures**: EdDSA-Poseidon (zk-kit compatible)
- **Field**: BN254 scalar field (21888242871839275222246405745257275088548364400416034343698204186575808495617)

---

## 2. Medium-Level Architecture

### 2.1 Module Structure

```rust
nihilium_primitives/
├── contracts.rs              // Alloy-rs smart contract bindings (DONE)
├── crypto/
│   ├── mod.rs
│   ├── babyjub.rs           // Baby Jubjub curve operations
│   ├── poseidon.rs          // Poseidon hash variants
│   ├── mimc.rs              // MiMC-7 hash
│   ├── eddsa.rs             // EdDSA-Poseidon signatures
│   ├── he.rs                // Homomorphic encryption
│   ├── ecc.rs               // ECC encryption/decryption
│   └── utils.rs             // Field ops, conversions
├── merkle/
│   ├── mod.rs
│   ├── tree.rs              // Generic Merkle tree
│   ├── mimc_tree.rs         // MiMC-based tree
│   └── keccak_tree.rs       // Keccak-based tree
├── client/
│   ├── mod.rs
│   ├── sealing.rs           // Sealing process state machine
│   └── unsealing.rs         // Unsealing process state machine
├── processor/
│   ├── mod.rs
│   └── processor.rs         // Server-side processing
├── data_stream/
│   ├── mod.rs
│   ├── types.rs             // IDataStream trait
│   ├── client.rs            // HTTP client implementation
│   ├── evm.rs               // EVM-based data stream
│   └── watcher.rs           // Event watcher
├── reveal_methods/
│   ├── mod.rs
│   ├── chained_proof.rs     // Chained proof state machine
│   ├── collections/
│   │   ├── mod.rs
│   │   ├── types.rs         // Collection traits
│   │   └── reveal_only.rs   // Reveal-only implementation
│   └── zk_proofs/
│       ├── mod.rs
│       └── types.rs         // Proof action types
├── persistence/
│   ├── mod.rs
│   ├── types.rs             // Persistence traits
│   └── file.rs              // File-based persistence
├── contract_wrappers/
│   ├── mod.rs
│   ├── ephemeral_tree.rs    // EmpheralMerkleTreeWrapper
│   ├── chained_proof.rs     // ChainedProofWrapper
│   └── local_vm.rs          // Local VM executor
├── types/
│   ├── mod.rs
│   └── protocol.rs          // Protocol type definitions
└── utils.rs                 // Utility functions
```

### 2.2 Data Flow Architecture

#### Sealing Flow
```
User Secret → Client Sealing Process → Processor → Encrypted Package
    ↓                                       ↓
    └─────────────────────────────────────→ Data Stream
```

#### Unsealing Flow
```
Encrypted Package → Reveal Condition → Data Stream → Chained Proof
    ↓                                                       ↓
Client Unsealing Process ← Processor ←──────────────────┘
    ↓
Decrypted Secret
```

### 2.3 State Machines

#### Sealing Phase States
```rust
pub enum ClientProcessorSealingPhase {
    NotStarted = -1,
    GeneratingSecrets = 0,
    RequestCommitment = 1,
    ProcessingCommitment = 2,
    ProcessingIndividualRevealConditions = 3,
    EncryptingShamirSecret = 4,
    Done = 5,
    Error = -99,
}
```

#### Unsealing Phase States
```rust
pub enum UnsealingStatus {
    NotStarted = 0,
    RevealingInitialCondition = 1,
    RevealValueSent = 2,
    RevealValueExposed = 3,
    AwaitOtherSealConditions = 4,
    UnsealPossible = 5,
    UnsealingInProgress = 6,
    Done = 7,
    Error = -99,
}
```

---

## 3. Low-Level API Specification

### 3.1 Cryptographic Tools Module

#### 3.1.1 Baby Jubjub Operations

```rust
/// Baby Jubjub extended point representation
#[derive(Debug, Clone, Copy)]
pub struct BabyJubExtPoint {
    pub x: FieldElement,
    pub y: FieldElement,
    pub z: FieldElement,
    pub t: FieldElement,
}

/// Public key type
pub type PubKey = BabyJubExtPoint;

/// Private key type (scalar)
pub type PrivKey = FieldElement;

/// Generate a random private key (248-bit)
pub fn gen_priv_key() -> PrivKey;

/// Derive public key from private key
pub fn gen_pub_key(priv_key: PrivKey) -> PubKey;

/// Convert private scalar to public key
pub fn private_scalar_to_pub_key(scalar: FieldElement) -> [FieldElement; 2];

/// Convert coordinates to extended point
pub fn coordinates_to_ext_point_bigint(x: FieldElement, y: FieldElement) -> BabyJubExtPoint;

/// Convert extended point to coordinate array [x, y]
pub fn to_bigint_array(point: &BabyJubExtPoint) -> [FieldElement; 2];
```

#### 3.1.2 Poseidon Hash

```rust
/// Poseidon hash with 1 input
pub fn poseidon1(inputs: [FieldElement; 1]) -> FieldElement;

/// Poseidon hash with 2 inputs
pub fn poseidon2(inputs: [FieldElement; 2]) -> FieldElement;

/// Poseidon hash with 4 inputs
pub fn poseidon4(inputs: [FieldElement; 4]) -> FieldElement;

/// Specialized hash for cyphertext commitment
pub fn hash_cypher_text(
    cyphertexts: &[FieldElement],      // 16 elements (8 points * 2)
    ephemeral_keys: &[FieldElement],   // 16 elements (8 points * 2)
    new_public_key: [FieldElement; 2],
    hashed_reveal_preimage: FieldElement,
    random_value: FieldElement,
    unseal_condition_root: FieldElement,
    metadata_root: FieldElement,
) -> FieldElement;
```

#### 3.1.3 MiMC Hash

```rust
/// MiMC-7 hash function (ZK-friendly)
pub struct MimcHasher {
    // Internal state
}

impl MimcHasher {
    /// Create new MiMC hasher
    pub fn new() -> Self;

    /// Hash two field elements (left, right)
    pub fn hash(&self, left: FieldElement, right: FieldElement) -> FieldElement;
}

/// Zero element for MiMC trees: mimc7(42, 42)
pub const ZERO_MIMC: FieldElement =
    7507787612525723758659662260399184323980001748885802124580171315331567144978;
```

#### 3.1.4 EdDSA Signatures

```rust
/// EdDSA signature structure
#[derive(Debug, Clone)]
pub struct Signature {
    pub r8: [FieldElement; 2],  // R8 point [x, y]
    pub s: FieldElement,         // Signature scalar
}

/// Sign a message using EdDSA-Poseidon
pub fn sign_message(private_key: &[u8], message: FieldElement) -> Signature;

/// Verify an EdDSA-Poseidon signature
pub fn verify_signature(
    message: FieldElement,
    signature: &Signature,
    public_key: [FieldElement; 2],
) -> bool;

/// Derive public key from private key
pub fn derive_public_key(private_key: &[u8]) -> [FieldElement; 2];

/// Derive secret scalar from seed
pub fn derive_secret_scalar(seed: &[u8]) -> FieldElement;
```

#### 3.1.5 Homomorphic Encryption (HE)

```rust
/// Encrypted message structure (8 points for 248-bit value)
#[derive(Debug, Clone)]
pub struct HEEncrypted {
    pub encrypted_messages: Vec<BabyJubExtPoint>,  // 8 points
    pub ephemeral_keys: Vec<BabyJubExtPoint>,      // 8 keys
}

/// Encrypt a private scalar using homomorphic encryption
/// Returns encrypted messages and ephemeral keys
pub fn he_encrypt_from_point(
    private_scalar: FieldElement,
    public_key: PubKey,
) -> HEEncrypted;

/// Decrypt homomorphically encrypted value
pub fn he_decrypt(
    private_key: FieldElement,
    cyphertexts: &[FieldElement],      // 16 elements (flattened points)
    ephemeral_keys: &[FieldElement],   // 16 elements (flattened keys)
) -> FieldElement;
```

#### 3.1.6 ECC Encryption

```rust
/// ECC encrypted message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ECCEncryptedMessage {
    pub ciphertext_hex: String,
    pub r: ECPoint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ECPoint {
    pub x: String,
    pub y: String,
}

/// Encrypt a secret using ECC on Baby Jubjub curve
pub fn encrypt_ecc_babyjub(
    secret: FieldElement,
    public_key: PubKey,
) -> ECCEncryptedMessage;

/// Decrypt an ECC encrypted message
pub fn decrypt_ecc_babyjub(
    ciphertext_hex: &str,
    r_point: ECPoint,
    private_key: FieldElement,
) -> FieldElement;
```

#### 3.1.7 Utility Functions

```rust
/// Generate random 248-bit number (< BN254 field size)
pub fn generate_random_248bit_number() -> FieldElement;

/// Shrink a field element to specified bits
pub fn shrink_to_bits(value: FieldElement, bits: u32) -> FieldElement;

/// Split large number into 8 chunks (31 bits each)
pub fn split_large_number(value: FieldElement) -> Vec<FieldElement>;

/// Convert BigInt to buffer
pub fn bigint_to_buffer(value: FieldElement) -> Vec<u8>;

/// Convert Uint8Array to hex string
pub fn uint8array_to_hex(data: &[u8]) -> String;

/// Pad hex string to specified length
pub fn to_padded_hex(value: FieldElement, length: usize) -> String;
```

---

### 3.2 Merkle Tree Module

#### 3.2.1 Generic Merkle Tree

```rust
/// Merkle proof path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofPath {
    pub path_elements: Vec<FieldElement>,
    pub path_indices: Vec<u8>,
    pub path_positions: Vec<u8>,
    pub path_root: FieldElement,
}

/// Generic Merkle tree trait
pub trait MerkleTree {
    /// Get tree depth
    fn depth(&self) -> usize;

    /// Get root hash
    fn root(&self) -> FieldElement;

    /// Get all elements
    fn elements(&self) -> &[FieldElement];

    /// Insert single element
    fn insert(&mut self, element: FieldElement);

    /// Bulk insert elements
    fn bulk_insert(&mut self, elements: &[FieldElement]);

    /// Generate proof for an element
    fn proof(&self, element: FieldElement) -> Option<ProofPath>;

    /// Get path to leaf at index
    fn path(&self, index: usize) -> ProofPath;

    /// Verify a proof
    fn verify(&self, element: FieldElement, proof: &ProofPath) -> bool;
}
```

#### 3.2.2 MiMC Merkle Tree

```rust
/// MiMC-based Merkle tree
pub struct MimcMerkleTree {
    depth: usize,
    elements: Vec<FieldElement>,
    zero_element: FieldElement,
    hasher: MimcHasher,
}

impl MimcMerkleTree {
    /// Create new MiMC Merkle tree
    pub fn new(depth: usize, leaves: Vec<FieldElement>) -> Self;

    /// Tree hasher function
    pub fn tree_hasher(left: FieldElement, right: FieldElement) -> FieldElement;
}

impl MerkleTree for MimcMerkleTree { /* ... */ }
```

#### 3.2.3 Keccak Merkle Tree

```rust
/// Keccak-based Merkle tree
pub struct KeccakMerkleTree {
    depth: usize,
    elements: Vec<String>,  // Hex strings
    zero_element: String,
}

impl KeccakMerkleTree {
    /// Create new Keccak Merkle tree
    pub fn new(depth: usize, leaves: Vec<String>) -> Self;

    /// Keccak tree hasher
    pub fn keccak_tree_hasher(left: FieldElement, right: FieldElement) -> String;
}

impl MerkleTree for KeccakMerkleTree { /* ... */ }

/// Zero element for Keccak trees
pub const ZERO_KECCAK: &str =
    "0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6";
```

---

### 3.3 Client Sealing Module

#### 3.3.1 Sealing Process Interface

```rust
/// Client single-share sealing process
pub trait IClientSingleShareSealingProcess {
    /// Initialize sealing with secret and metadata
    async fn initialize(
        &mut self,
        secret: FieldElement,
        metadata_root: FieldElement,
    ) -> Result<()>;

    /// Request commitment from processor
    async fn request_commitment(
        &mut self,
        require_proof: bool,
    ) -> Result<SingleSealRequest>;

    /// Process seal response from processor
    async fn process_seal_response(
        &mut self,
        processor_response: SingleSealRequestResponse,
    ) -> Result<SingleSealStoragePackage>;

    /// Get current phase
    fn get_phase(&self) -> ClientProcessorSealingPhase;

    /// Get throwaway packages (local only)
    fn get_secret_throwaway_packages(&self) -> Vec<SecretThrowawayPackage>;

    /// Get reveal conditions
    fn get_reveal_conditions(&self) -> Vec<RevealConditionRequest>;
}
```

#### 3.3.2 Sealing Request/Response Types

```rust
/// Request to seal a secret
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleSealRequest {
    pub address: String,
    pub circuit_id: String,
    pub hashed_reveal_value_preimage: String,
    pub hashed_unseal_condition_root: String,
    pub hashed_metadata_root: String,
    pub require_proof: bool,
}

/// Response from processor for seal request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleSealRequestResponse {
    pub address: String,
    pub circuit_id: String,
    pub cyphertexts: [String; 16],
    pub empheral_keys: [String; 16],
    pub signature_s: String,
    pub signature_r8x: String,
    pub signature_r8y: String,
    pub new_public_key: [String; 2],
    pub severed_commitment_random_value: String,
    pub proof: String,
    pub public_signals: Vec<String>,
    pub hashed_unseal_condition_root: String,
    pub hashed_metadata_root: String,
}

/// Complete seal storage package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleSealStoragePackage {
    pub private_package: SingleShareSealPrivatePackage,
    pub public_package: SingleShareSealPublicPackage,
    pub hidden_package: SingleShareSealHiddenPackage,
}

/// Private package (stored securely by client)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleShareSealPrivatePackage {
    pub cyphertexts: Vec<String>,
    pub empheral_keys: Vec<String>,
    pub proof: String,
    pub public_signals: Vec<String>,
    pub public_key_he: [String; 2],
    pub public_verification_key: [String; 2],
    pub encrypted_secret: ECCEncryptedMessage,
    pub reveal_value: String,
    pub unseal_condition_root: String,
    pub metadata_root: String,
    pub reveal_conditions: Vec<UnsealProofAction>,
    pub reveal_collection_id: String,
    pub reveal_collection_inputs: serde_json::Value,
}

/// Public package (can be shared)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleShareSealPublicPackage {
    pub reveal_value: String,
    pub address: String,
    pub circuit_id: String,
    pub data_stream_ids: Vec<String>,
    pub data_stream_urls: Vec<String>,
    pub processor_url: String,
    pub proof: String,
    pub public_signals: Vec<String>,
}

/// Hidden package (password-protected)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleShareSealHiddenPackage {
    // Reserved for future use
}
```

#### 3.3.3 Sealing Implementation

```rust
pub struct ClientSingleShareSealingProcess {
    processor: ProcessorEndpoint,
    phase: ClientProcessorSealingPhase,
    secret: FieldElement,
    metadata_root: FieldElement,
    keypair: PrivKey,
    reveal_value_preimage: FieldElement,
    unseal_condition_root: FieldElement,
    chained_proof_collection: Box<dyn ChainedProofCollection>,
    data_streams: Vec<Box<dyn IDataStream>>,
    require_proof: bool,
}

impl ClientSingleShareSealingProcess {
    pub fn new(
        processor: ProcessorEndpoint,
        chained_proof_collection: Box<dyn ChainedProofCollection>,
    ) -> Self;

    /// Request commitment and get response from processor
    pub async fn request_commitment_to_processor(
        &mut self,
        require_proof: bool,
    ) -> Result<SingleSealStoragePackage>;
}
```

---

### 3.4 Client Unsealing Module

#### 3.4.1 Unsealing Process Interface

```rust
/// Client single-share unsealing process
pub trait IClientSingleShareUnsealingProcess {
    /// Initialize with sealed package
    async fn initialize(&mut self, seal: SingleSealStoragePackage) -> Result<()>;

    /// Check if eligible for unsealing
    async fn validate_eligible_for_unsealing(&self) -> Result<bool>;

    /// Get current unsealing status
    async fn get_unsealing_status(&self) -> UnsealingStatus;

    /// Get processor status
    async fn get_processor_status(&self) -> ProcessorStatus;

    /// Display reveal conditions
    async fn display_reveal_conditions(&self);

    /// Publish reveal value to data stream
    async fn publish_reveal_value(&mut self, data_stream_id: &str) -> Result<()>;

    /// Start unsealing process
    async fn start_unsealing(&mut self) -> Result<SingleUnsealRequest>;

    /// Process unseal response from processor
    async fn process_unseal_response(
        &mut self,
        processor_response: SingleSealUnsealRequestResponse,
    ) -> Result<FieldElement>;
}
```

#### 3.4.2 Unsealing Request/Response Types

```rust
/// Unseal request to processor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleUnsealRequest {
    pub address: String,
    pub circuit_id: String,
    pub public_key: [String; 2],
    pub signature_s: String,
    pub signature_r8x: String,
    pub signature_r8y: String,
    pub proof: String,
    pub public_signals: Vec<Vec<String>>,
    pub proofs: Vec<String>,
    pub data_stream_address: String,
    pub unseal_proof_actions: Vec<UnsealProofAction>,
}

/// Response from processor for unseal request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleSealUnsealRequestResponse {
    pub unpacked_private_scalar: String,
}

/// Processor status indicators
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessorStatus {
    Available = 0,
    WarnStakeDecreasing = 1,
    WarnStakeLow = 2,
    WarnStakeCritical = 3,
    Unavailable = 4,
    NewPublicKeysRequired = 5,
    Error = -99,
}
```

#### 3.4.3 Unsealing Implementation

```rust
pub struct ClientSingleShareUnsealingProcess {
    processor: ProcessorEndpoint,
    phase: UnsealingStatus,
    seal: SingleSealStoragePackage,
    data_streams: Vec<Box<dyn IDataStream>>,
    chained_proof_collection: Box<dyn ChainedProofCollection>,
    unsealing_state: UnsealingState,
    awaiting_reveal_value_to_be_provable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsealingState {
    pub phase: UnsealingStatus,
    pub seal: SingleSealStoragePackage,
    pub unseal_response: Option<SingleSealUnsealRequestResponse>,
    pub data_stream_id: Option<String>,
    pub data_stream_local_index: Option<usize>,
    pub data_stream_global_index: Option<usize>,
}

impl ClientSingleShareUnsealingProcess {
    pub fn new(
        processor: ProcessorEndpoint,
        chained_proof_collection: Box<dyn ChainedProofCollection>,
        seal: SingleSealStoragePackage,
    ) -> Self;

    /// Wait for reveal value to become provable
    pub async fn await_reveal_value_to_be_provable<F>(
        &mut self,
        callback: Option<F>,
    ) -> Result<()>
    where
        F: Fn() + Send + 'static;

    /// Get unseal request without sending to processor
    pub async fn get_unseal_request(&self) -> Result<SingleUnsealRequest>;

    /// Request unseal from processor
    pub async fn unseal_request_to_processor(
        &mut self,
    ) -> Result<SingleSealUnsealRequestResponse>;
}
```

---

### 3.5 Processor Module

#### 3.5.1 Processor Core

```rust
/// Server-side processor for sealing/unsealing
pub struct Processor {
    signing_private_key: FieldElement,
    private_he_key: FieldElement,
    public_he_key: PubKey,
    signing_public_key: [FieldElement; 2],
    chained_proof_address: String,
    forced_opening_address: String,
    signer: Box<dyn EthSigner>,
}

impl Processor {
    pub fn new(
        signing_private_key: &str,
        private_he_key: &str,
        chained_proof_address: String,
        forced_opening_address: String,
        signer: Box<dyn EthSigner>,
    ) -> Self;

    /// Initialize crypto libraries
    pub async fn initialize(&mut self) -> Result<()>;

    /// Get public keys
    pub async fn get_public_keys(&self) -> ProcessorPublicKeys;

    /// Process seal request (runs in TEE/SGX)
    pub async fn process_seal_request(
        &self,
        request: SingleSealRequest,
    ) -> Result<SingleSealRequestResponse>;

    /// Process unseal request (runs in TEE/SGX)
    pub async fn process_unseal_request(
        &self,
        request: SingleUnsealRequest,
    ) -> Result<SingleSealUnsealRequestResponse>;

    /// Get chain ID
    pub fn get_chain_id(&self) -> u64;

    /// Get chained proof contract address
    pub fn get_chained_proof_address(&self) -> &str;

    /// Get forced opening contract address
    pub fn get_forced_opening_address(&self) -> &str;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessorPublicKeys {
    pub signing_public_key: [String; 2],
    pub he_public_key: [String; 2],
}

/// Processor endpoint configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessorEndpoint {
    pub url: String,
    pub is_tor: bool,
    pub public_verification_key: [FieldElement; 2],
    pub public_he_encryption_key: [FieldElement; 2],
    pub server_address: String,
}
```

#### 3.5.2 Processor Protocol Paths

```rust
pub mod protocol_processor_paths {
    pub const REQUEST_SEAL: &str = "/request_seal";
    pub const REQUEST_UNSEAL: &str = "/request_unseal";
    pub const GET_PUBLIC_KEYS: &str = "/get_public_keys";
}
```

---

### 3.6 Data Stream Module

#### 3.6.1 Data Stream Trait

```rust
/// Data stream interface for provable data publication
#[async_trait]
pub trait IDataStream: Send + Sync {
    /// Initialize the data stream
    async fn initialize(&mut self) -> Result<()>;

    /// Get data stream address
    fn get_address(&self) -> String;

    /// Get data stream URL
    fn get_url(&self) -> String;

    /// Check if data stream has specific root
    async fn has_data_stream_root(&self, root: &str) -> Result<bool>;

    /// Check if value root exists
    async fn has_value_root(&self, root: &str) -> Result<bool>;

    /// Check if value is provable
    async fn is_provable(&self, value: &str) -> Result<bool>;

    /// Post data to stream, returns [global_index, local_index]
    async fn post_data(&self, data: Vec<String>) -> Result<[usize; 2]>;

    /// Get proof for a value
    async fn get_proof(
        &self,
        value: &str,
    ) -> Result<(ProofPath, ProofPath, u64, usize, usize)>;

    /// Get latest global leaf proof
    async fn get_latest_global_leaf_proof(
        &self,
    ) -> Result<(ProofPath, String, u64, usize)>;

    /// Get global tree index
    async fn get_global_tree_index(&self) -> Result<usize>;
}
```

#### 3.6.2 Data Stream Client (HTTP)

```rust
/// HTTP client for remote data streams
pub struct DataStreamClient {
    endpoint: String,
    address: String,
    client: reqwest::Client,
}

impl DataStreamClient {
    pub fn new(endpoint: String) -> Self;
}

#[async_trait]
impl IDataStream for DataStreamClient { /* ... */ }
```

#### 3.6.3 Data Stream Protocol Paths

```rust
pub mod protocol_data_stream_paths {
    pub const POST_DATA: &str = "/postData";
    pub const GET_PROOF: &str = "/proof/";
    pub const IS_PROVABLE: &str = "/isProvable/";
    pub const GET_GLOBAL_TREE_INDEX: &str = "/globalTreeIndex";
    pub const GET_ADDRESS: &str = "/address";
    pub const GET_LATEST_GLOBAL_LEAF_PROOF: &str = "/latestGlobalLeafProof";
}
```

#### 3.6.4 EVM Data Stream Watcher

```rust
/// Event watcher for EVM-based data streams
pub struct EVMDataStreamWatcher {
    contract: EmpheralMerkleTreeContract,
    provider: Arc<dyn Provider>,
    callbacks: Vec<Box<dyn Fn(TreeUpdateEvent) + Send + Sync>>,
}

#[derive(Debug, Clone)]
pub struct TreeUpdateEvent {
    pub leaf_index: u64,
    pub timestamp: u64,
    pub new_value_root: FieldElement,
    pub leaf_hash: FieldElement,
    pub new_merkle_root: FieldElement,
}

impl EVMDataStreamWatcher {
    pub fn new(contract_address: &str, provider: Arc<dyn Provider>) -> Self;

    /// Subscribe to tree update events
    pub fn subscribe_to_tree_update<F>(&mut self, callback: F)
    where
        F: Fn(TreeUpdateEvent) + Send + Sync + 'static;

    /// Start listening to events
    pub async fn start_listening(&mut self) -> Result<()>;

    /// Stop listening to events
    pub fn stop_listening(&mut self);
}
```

---

### 3.7 Reveal Methods Module

#### 3.7.1 Chained Proof Core

```rust
/// Proving state for chained proofs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvingState {
    pub current_hash: String,
    pub expected_hash: String,
    pub current_index: usize,
    pub outputs: Vec<Vec<String>>,
    pub prepared_public_inputs: Vec<String>,
    pub prepared_proof: String,
    pub proof_verifier: String,
    pub commited_processor_public_key: [u64; 2],
    pub initiator: String,
}

/// Chained proof state machine
pub struct ChainedProof {
    proving_states: HashMap<String, ProvingState>,
    public_proof_verifier: String,
    forced_opening_verifier: String,
    chained_proof_wrapper: Option<ChainedProofWrapper>,
}

impl ChainedProof {
    pub fn new(
        public_proof_verifier: String,
        forced_opening_verifier: String,
        provider: Option<Arc<dyn Provider>>,
        signer: Option<Arc<dyn EthSigner>>,
    ) -> Self;

    /// Initialize Solidity integration
    pub async fn initialize_solidity(&mut self) -> Result<()>;

    /// Start proving process
    pub fn dryrun_start_proving(
        &self,
        verifier_address: &str,
        public_inputs: Vec<String>,
        proof: String,
    ) -> ProvingState;

    /// Prepare next proof in chain
    pub fn dryrun_prepare_next_proof(
        &self,
        state: ProvingState,
        verifier_address: &str,
        public_inputs: Vec<String>,
        proof: String,
    ) -> ProvingState;

    /// Validate data root
    pub async fn dryrun_validate_data_root(
        &self,
        state: ProvingState,
        public_input_index: usize,
        is_delayed_proof: bool,
        optional_dual_tree_proof: String,
        optional_dual_tree_public_inputs: Vec<String>,
        merkle_root_index: usize,
    ) -> Result<ProvingState>;

    /// Validate timestamp
    pub fn dryrun_validate_timestamp(
        &self,
        state: ProvingState,
        output_proof_index: usize,
        output_index: usize,
        public_input_index: usize,
        timestamp_window: u64,
    ) -> ProvingState;

    /// Chain static input
    pub fn dryrun_chain_static_input(
        &self,
        state: ProvingState,
        inputs: Vec<String>,
        indexes: Vec<usize>,
    ) -> ProvingState;

    /// Pass signal between proofs
    pub fn dryrun_chain_pass_signal(
        &self,
        state: ProvingState,
        public_input_indexes: Vec<usize>,
        output_proof_indexes: Vec<usize>,
        output_signal_indexes: Vec<usize>,
        dryrun_mode: bool,
    ) -> ProvingState;

    /// Verify chained proof
    pub async fn dryrun_chain_proof_verify(
        &self,
        state: ProvingState,
        ignore_proof: bool,
    ) -> Result<ProvingState>;

    /// Solidity equivalents (contract calls)
    pub async fn solidity_dryrun_start_proving(
        &self,
        verifier_address: &str,
        public_inputs: Vec<String>,
        proof: String,
        verify_proof: bool,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_prepare_next_proof(
        &self,
        state: ProvingState,
        verifier_address: &str,
        public_inputs: Vec<String>,
        proof: String,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_validate_data_root(
        &self,
        state: ProvingState,
        datastream: &str,
        public_input_index: usize,
        is_delayed_proof: bool,
        optional_dual_tree_proof: String,
        optional_dual_tree_public_inputs: Vec<String>,
        merkle_root_index: usize,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_validate_timestamp(
        &self,
        state: ProvingState,
        output_proof_index: usize,
        output_index: usize,
        public_input_index: usize,
        timestamp_window: u64,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_chain_static_input(
        &self,
        state: ProvingState,
        inputs: Vec<String>,
        indexes: Vec<usize>,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_chain_pass_signal(
        &self,
        state: ProvingState,
        public_input_indexes: Vec<usize>,
        output_proof_indexes: Vec<usize>,
        output_signal_indexes: Vec<usize>,
        dryrun_mode: bool,
    ) -> Result<ProvingState>;

    pub async fn solidity_dryrun_chain_proof_verify(
        &self,
        state: ProvingState,
        ignore_proof: bool,
    ) -> Result<ProvingState>;
}
```

#### 3.7.2 Action Types

```rust
/// Chained proof action types
pub const ACTION_START_UNSEALING: &str = "start_unsealing";
pub const ACTION_PREPARE_NEXT_PROOF: &str = "prepare_next_proof";
pub const ACTION_CHAIN_PROOF_VERIFY: &str = "chain_proof_verify";
pub const ACTION_STATIC_INPUT: &str = "static_input";
pub const ACTION_PASS_SIGNAL: &str = "pass_signal";
pub const ACTION_PASS_SIGNAL_PLUSONE: &str = "pass_signal_plusone";
pub const ACTION_VALIDATE_TIMESTAMP: &str = "validate_timestamp";
pub const ACTION_VALIDATE_DATA_ROOT: &str = "validate_data_root";

/// Unseal proof action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsealProofAction {
    pub action: String,
    pub params: serde_json::Value,
}
```

#### 3.7.3 Proof Collections

```rust
/// Abstract proof collection trait
#[async_trait]
pub trait ChainedProofCollection: Send + Sync {
    /// Get collection identifier
    fn get_collection_id(&self) -> String;

    /// Get constructor fields
    fn get_constructor_fields(&self) -> serde_json::Value;

    /// Get unseal proof actions
    fn get_unseal_proof_actions(&self) -> Vec<UnsealProofAction>;

    /// Get associated data streams
    fn get_datastreams(&self) -> Vec<Box<dyn IDataStream>>;

    /// Get contract address
    fn get_address(&self) -> String;

    /// Produce proofs for unsealing
    async fn produce_proofs(
        &self,
        data_stream: &dyn IDataStream,
        processor: &ProcessorEndpoint,
        opening_proof: &[u8],
        opening_public_inputs: Vec<String>,
    ) -> Result<ProofBundle>;

    /// Verify using Solidity
    async fn verify_solidity(
        &self,
        dryrun: bool,
        data_stream_address: &str,
        proofs: Vec<Vec<u8>>,
        public_inputs: Vec<Vec<String>>,
    ) -> Result<String>;

    /// Get unseal root
    async fn get_unseal_root(
        &self,
        dryrun: bool,
        proofs: Vec<Vec<u8>>,
        public_inputs: Vec<Vec<String>>,
    ) -> Result<String>;
}

#[derive(Debug, Clone)]
pub struct ProofBundle {
    pub proofs: Vec<Vec<u8>>,
    pub public_inputs: Vec<Vec<String>>,
}

/// Reveal-only collection (no conditions)
pub struct RevealOnlyCollection {
    opening_proof_address: String,
    unseal_proof_actions: Vec<UnsealProofAction>,
    chained_proof: ChainedProof,
    datastreams: Vec<Box<dyn IDataStream>>,
}

impl RevealOnlyCollection {
    pub fn new(
        opening_proof_address: String,
        datastreams: Vec<Box<dyn IDataStream>>,
        provider: Option<Arc<dyn Provider>>,
        signer: Option<Arc<dyn EthSigner>>,
    ) -> Self;
}

#[async_trait]
impl ChainedProofCollection for RevealOnlyCollection { /* ... */ }
```

---

### 3.8 Contract Wrappers Module

#### 3.8.1 Ephemeral Merkle Tree Wrapper

```rust
/// Wrapper for EmpheralMerkleTree contract
pub struct EmpheralMerkleTreeWrapper {
    contract: EmpheralMerkleTreeKeccak,
    signer: Arc<dyn EthSigner>,
    address: String,
    callbacks: Vec<Box<dyn Fn(TreeUpdateEvent) + Send + Sync>>,
}

impl EmpheralMerkleTreeWrapper {
    pub fn new(signer: Arc<dyn EthSigner>) -> Self;

    /// Deploy new contract
    pub async fn deploy(&mut self, levels: u8) -> Result<()>;

    /// Attach to existing contract
    pub async fn attach(&mut self, address: &str) -> Result<()>;

    /// Get contract address
    pub fn get_address(&self) -> &str;

    /// Get current index
    pub async fn get_current_index(&self) -> Result<u64>;

    /// Subscribe to tree updates
    pub fn subscribe_to_tree_update<F>(&mut self, callback: F)
    where
        F: Fn(TreeUpdateEvent) + Send + Sync + 'static;

    /// Start listening to events
    pub fn start_listening_to_tree_updates(&mut self);

    /// Stop listening to events
    pub fn stop_listening_to_tree_updates(&mut self);

    /// Find deployment block (binary search)
    pub async fn find_deployment_block(&self) -> Result<u64>;

    /// Get last insert event
    pub async fn get_last_insert_event(&self) -> Result<InsertEvent>;

    /// Get all tree update events
    pub async fn get_tree_update_events(&self) -> Result<Vec<TreeUpdateEvent>>;

    /// Insert value into tree
    pub async fn insert(
        &self,
        previous_leaf: &str,
        insert_value: &str,
        value_path: Vec<String>,
    ) -> Result<InsertReceipt>;

    /// Get last Merkle root
    pub async fn get_last_merkle_root(&self) -> Result<String>;

    /// Check if value root is known
    pub async fn is_known_value_root(&self, root: &str) -> Result<bool>;
}

#[derive(Debug, Clone)]
pub struct InsertEvent {
    pub leaf_index: u64,
    pub timestamp: u64,
    pub insert_value: String,
    pub new_merkle_root: String,
}

#[derive(Debug, Clone)]
pub struct InsertReceipt {
    pub index: u64,
    pub timestamp: u64,
    pub new_value_root: FieldElement,
    pub leaf_value: FieldElement,
    pub leaf_hash: FieldElement,
    pub gas_used: String,
}
```

#### 3.8.2 Chained Proof Wrapper

```rust
/// Wrapper for ChainedProof contract with local VM optimization
pub struct ChainedProofWrapper {
    contract: ChainedProof,
    signer: Option<Arc<dyn EthSigner>>,
    provider: Arc<dyn Provider>,
    address: String,
    local_executor: Option<LocalVMExecutor>,
    use_local_vm: bool,
    loaded_verifiers: HashSet<String>,
}

impl ChainedProofWrapper {
    pub fn new(
        provider: Arc<dyn Provider>,
        signer: Option<Arc<dyn EthSigner>>,
        use_local_vm: bool,
    ) -> Self;

    /// Attach to existing contract
    pub async fn attach(&mut self, address: &str) -> Result<()>;

    /// Get contract address
    pub fn get_address(&self) -> &str;

    /// Load verifier contract into local VM
    pub async fn load_verifier_contract(
        &mut self,
        verifier_address: &str,
        verifier_abi: &serde_json::Value,
    ) -> Result<()>;

    /// Preload common verifiers
    pub async fn preload_common_verifiers(
        &mut self,
        verifier_addresses: Vec<String>,
        verifier_abi: &serde_json::Value,
    ) -> Result<()>;

    /// Execute static call (local VM or network)
    async fn execute_static_call(
        &self,
        function_name: &str,
        args: Vec<serde_json::Value>,
        force_remote: bool,
    ) -> Result<serde_json::Value>;

    /// Dryrun operations
    pub async fn dryrun_prepare_next_proof(
        &self,
        state: ProvingState,
        verifier: &str,
        public_inputs: Vec<String>,
        proof: String,
    ) -> Result<ProvingState>;

    pub async fn dryrun_validate_data_root(
        &self,
        state: ProvingState,
        datastream: &str,
        public_input_index: usize,
        is_delayed_proof: bool,
        optional_dual_tree_proof: String,
        optional_dual_tree_public_inputs: Vec<String>,
        merkle_root_index: usize,
    ) -> Result<ProvingState>;

    pub async fn dryrun_validate_timestamp(
        &self,
        state: ProvingState,
        output_proof_index: usize,
        output_index: usize,
        public_input_index: usize,
        timestamp_window: u64,
    ) -> Result<ProvingState>;

    pub async fn dryrun_chain_static_input(
        &self,
        state: ProvingState,
        inputs: Vec<String>,
        indexes: Vec<usize>,
    ) -> Result<ProvingState>;

    pub async fn dryrun_chain_pass_signal(
        &self,
        state: ProvingState,
        public_input_indexes: Vec<usize>,
        output_proof_indexes: Vec<usize>,
        output_indexes: Vec<usize>,
    ) -> Result<ProvingState>;

    pub async fn dryrun_chain_proof_verify(
        &self,
        state: ProvingState,
        ignore_proof: bool,
    ) -> Result<ProvingState>;

    pub async fn dryrun_start_proving(
        &self,
        verifier: &str,
        public_inputs: Vec<String>,
        proof: String,
        verify_proof: bool,
    ) -> Result<ProvingState>;

    /// Cache management
    pub fn clear_cache(&mut self);
    pub fn get_cache_stats(&self) -> Option<CacheStats>;
    pub fn set_use_local_vm(&mut self, use_local_vm: bool);
    pub fn is_using_local_vm(&self) -> bool;
    pub fn get_loaded_verifiers(&self) -> Vec<String>;
    pub fn is_verifier_loaded(&self, verifier_address: &str) -> bool;
}

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub size: usize,
    pub contracts: Vec<String>,
    pub pure_functions: HashMap<String, Vec<String>>,
    pub view_functions: HashMap<String, Vec<String>>,
}
```

#### 3.8.3 Local VM Executor

```rust
/// Local EVM executor for optimization
pub struct LocalVMExecutor {
    vm: EthereumVM,
    provider: Arc<dyn Provider>,
    signer: Option<Arc<dyn EthSigner>>,
    fallback_to_network: bool,
    contract_cache: HashMap<String, ContractInfo>,
}

#[derive(Debug, Clone)]
struct ContractInfo {
    bytecode: Vec<u8>,
    abi: serde_json::Value,
}

impl LocalVMExecutor {
    pub fn new(
        provider: Arc<dyn Provider>,
        signer: Option<Arc<dyn EthSigner>>,
        fallback_to_network: bool,
    ) -> Self;

    /// Initialize VM
    pub async fn initialize(&mut self) -> Result<()>;

    /// Load contract from network
    pub async fn load_contract_from_network(
        &mut self,
        address: &str,
        abi: &serde_json::Value,
    ) -> Result<()>;

    /// Execute static call locally
    pub async fn execute_static_call(
        &self,
        address: &str,
        function_name: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value>;

    /// Clear cache
    pub fn clear_cache(&mut self);

    /// Get cache statistics
    pub fn get_cache_stats(&self) -> CacheStats;
}
```

---

### 3.9 Persistence Module

#### 3.9.1 Persistence Traits

```rust
/// Data stream persistence interface
#[async_trait]
pub trait IDataStreamPersistence: Send + Sync {
    /// Get indexed local leaf positions
    async fn get_indexed_local_leaf(&self, leaf: &str) -> Result<Vec<(usize, usize)>>;

    /// Store local tree leaf
    async fn store_local_tree_leaf(
        &self,
        global_tree_index: usize,
        local_tree_index: usize,
        leaf: &str,
    ) -> Result<()>;

    /// Store global value tree leaf
    async fn store_global_value_tree_leaf(
        &self,
        local_tree_root: &str,
        timestamp: u64,
    ) -> Result<()>;

    /// Store global root tree leaf
    async fn store_global_root_tree_leaf(&self, root_value: &str) -> Result<()>;

    /// Get local tree at global index
    async fn get_local_tree(&self, global_tree_index: usize) -> Result<Box<dyn MerkleTree>>;

    /// Get global value tree
    async fn get_global_value_tree(&self) -> Result<Box<dyn MerkleTree>>;

    /// Get global root tree
    async fn get_global_root_tree(&self) -> Result<Box<dyn MerkleTree>>;

    /// Get global leaf timestamps
    async fn get_global_leaf_timestamps(&self) -> Result<HashMap<String, u64>>;

    /// Store local tree
    async fn store_local_tree(
        &self,
        global_tree_index: usize,
        merkle_tree: &dyn MerkleTree,
    ) -> Result<()>;

    /// Reset contract trees
    async fn reset_contract_trees(&self) -> Result<()>;

    /// Detect available local trees
    async fn detect_local_trees_available(
        &self,
        max_global_tree_index: usize,
    ) -> Result<bool>;

    /// Get on-chain publishing state
    async fn get_on_chain_publishing_state(&self) -> Result<OnChainPublishingState>;

    /// Set on-chain publishing state
    async fn set_on_chain_publishing_state(
        &self,
        state: OnChainPublishingState,
    ) -> Result<()>;
}

/// On-chain publishing state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnChainPublishingState {
    pub processing_local_tree: isize,
    pub local_trees_to_process: Vec<usize>,
}
```

#### 3.9.2 File-Based Persistence

```rust
/// File-based persistence implementation
pub struct DataStreamFilePersistence {
    folder_path: PathBuf,
    lv_index_db: sled::Db,
    create_merkle_tree: fn(usize, Vec<String>) -> Box<dyn MerkleTree>,
}

impl DataStreamFilePersistence {
    pub fn new(
        folder_path: PathBuf,
        create_merkle_tree: fn(usize, Vec<String>) -> Box<dyn MerkleTree>,
    ) -> Result<Self>;

    /// Ensure folder exists
    fn ensure_folder_exists(&self) -> Result<()>;

    /// Get file paths
    fn get_local_tree_path(&self, global_tree_index: usize) -> PathBuf;
    fn get_global_value_path(&self) -> PathBuf;
    fn get_global_root_path(&self) -> PathBuf;
}

#[async_trait]
impl IDataStreamPersistence for DataStreamFilePersistence { /* ... */ }
```

---

### 3.10 Type Definitions Module

#### 3.10.1 Common Protocol Types

```rust
pub type HexString = String;

/// Payment proof type
pub type PaymentProof = String;

/// Opening condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpeningCondition {
    pub address: String,
}

/// Reveal conditions enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RevealConditions {
    TopLevel,
    Timelock,
    IdentityProof,
    NonInterventionProof,
}

/// Static circuit input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticCircuitInput {
    pub circuit_id: String,
    pub inputfield_name: String,
    pub value: String,
}

/// Chained circuit input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainedCircuitInput {
    pub source_circuit_id: String,
    pub source_circuit_index: usize,
    pub target_circuit_id: String,
    pub outputfield_index: usize,
    pub inputfield_name: String,
}

/// Reveal condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevealCondition {
    pub address: String,
    pub circuit_id: String,
    pub static_inputs: Vec<StaticCircuitInput>,
    pub chained_inputs: Vec<ChainedCircuitInput>,
    pub random_value: String,
    pub proof: serde_json::Value,
    pub public_signals: Vec<String>,
}

/// Reveal condition request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevealConditionRequest {
    pub address: String,
    pub circuit_id: String,
    pub hashed_input_fields: String,
    pub random_value: String,
    pub proof: serde_json::Value,
    pub public_signals: Vec<String>,
}

/// Reveal condition request response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevealConditionRequestResponse {
    pub address: String,
    pub circuit_id: String,
    pub hashed_input_fields: String,
    pub random_value: String,
    pub signature_s: String,
    pub signature_r8x: String,
    pub signature_r8y: String,
}

/// Unseal reveal condition request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsealRevealConditionRequest {
    pub proof: String,
    pub commitment: String,
    pub public_signals: Vec<String>,
}

/// Throwaway Shamir secret (ephemeral)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThrowAwayShamirSecret {
    pub shamir_secret: FieldElement,
    pub secret_ecc_scalar: FieldElement,
    pub ecc_public_key: [FieldElement; 2],
}
```

---

### 3.11 Utilities Module

```rust
/// Convert field element to padded hex string
pub fn to_padded_hex(bn: FieldElement, length: usize) -> String;

/// Zero element for MiMC trees
pub const ZERO: FieldElement =
    7507787612525723758659662260399184323980001748885802124580171315331567144978;

/// Zero element for Keccak trees
pub const ZERO_KECCAK: &str =
    "0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6";

/// Create MiMC Merkle tree
pub async fn create_mimc_merkle_tree(
    depth: usize,
    leaves: Vec<String>,
) -> Result<MimcMerkleTree>;

/// Create Keccak Merkle tree
pub async fn create_keccak_merkle_tree(
    depth: usize,
    leaves: Vec<String>,
) -> Result<KeccakMerkleTree>;
```

---

### 3.12 Circuit Integration (External Dependencies)

The library depends on ZK circuits from `@nihilium/zkp-circuits`:

```rust
// These are external to this library but used via FFI/WASM
pub mod external_circuits {
    // Circuit types (to be imported from zkp-circuits crate)
    pub struct EncryptProofCircuit;
    pub struct ValidatedSigHeAddCircuit;
    pub struct CircomOpeningProofCircuit;
    pub struct SeveredCommitmentCircuit;

    // Input types for circuits
    pub struct EncryptProofInputType {
        pub private_key_scalar: String,
        pub nonce_key_p: Vec<String>,
        pub public_key: PubKeyInput,
    }

    pub struct ValidatedSigHeAddInputType {
        pub input_add: String,
        pub nonce_key: Vec<String>,
        pub point_org: Vec<CurvePoint>,
        pub ephemeral_key_org: Vec<CurvePoint>,
        pub public_key: PubKeyInput,
        pub severed_commit_preimage: String,
        pub severed_random_value: String,
        pub a: CurvePoint,
        pub r8x: String,
        pub r8y: String,
        pub s: String,
        pub corresponding_public_key: CurvePoint,
        pub unseal_condition_root: String,
        pub metadata_root: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct PubKeyInput {
        pub x: String,
        pub y: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct CurvePoint {
        pub x: String,
        pub y: String,
    }

    // Circuit API
    pub trait Circuit {
        async fn init(&mut self) -> Result<()>;
        async fn generate_proof(&self, input: &serde_json::Value) -> Result<ProofOutput>;
        async fn verify_proof(&self, proof_data: &ProofInput) -> Result<bool>;
    }

    #[derive(Debug, Clone)]
    pub struct ProofOutput {
        pub proof: Vec<u8>,
        pub public_signals: Vec<String>,
    }

    #[derive(Debug, Clone)]
    pub struct ProofInput {
        pub proof: Vec<u8>,
        pub public_signals: Vec<String>,
    }
}
```

---

### 3.13 Static Contract Configuration

```rust
/// Network IDs
pub mod network_ids {
    pub const GANACHE: u64 = 1337;
    pub const AVAX_TESTNET: u64 = 43113;
    pub const ETHEREUM_MAINNET: u64 = 1;
}

/// Deployed protocol contracts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployedProtocolContracts {
    pub chained_proof: String,
    pub ephemeral_merkle_tree: String,
    pub forced_opening_verifier: String,
    pub public_proof_verifier: String,
}

/// Get deployed contracts for network
pub fn get_deployed_protocol_contracts(network_id: u64) -> Option<DeployedProtocolContracts>;
```

---

## 4. Migration Notes: TypeScript to Rust

### 4.1 Key Differences

#### 4.1.1 Async Runtime
- **TypeScript**: Uses promises/async-await with Node.js/browser event loop
- **Rust**: Use `tokio` or `async-std` runtime with `async-trait` for traits

#### 4.1.2 Error Handling
- **TypeScript**: Throws exceptions, uses try-catch
- **Rust**: Use `Result<T, E>` types, `?` operator, custom error types

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PrivacyLibError {
    #[error("Cryptographic error: {0}")]
    CryptoError(String),

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    #[error("Contract error: {0}")]
    ContractError(String),

    #[error("Invalid state transition: {0}")]
    StateError(String),

    #[error("Proof generation failed: {0}")]
    ProofError(String),

    #[error("Persistence error: {0}")]
    PersistenceError(String),
}

pub type Result<T> = std::result::Result<T, PrivacyLibError>;
```

#### 4.1.3 Memory Management
- **TypeScript**: Garbage collected
- **Rust**: Ownership system, use `Arc<T>` for shared references, `Box<dyn Trait>` for trait objects

#### 4.1.4 BigInt Handling
- **TypeScript**: Native `BigInt` type
- **Rust**: Use `num-bigint` or field-specific types from cryptographic libraries

```rust
use num_bigint::BigUint;
use babyjubjub_rs::Fr as FieldElement;

// Conversion functions needed
pub fn bigint_to_field_element(value: &BigUint) -> FieldElement;
pub fn field_element_to_bigint(value: &FieldElement) -> BigUint;
pub fn hex_to_field_element(hex: &str) -> Result<FieldElement>;
pub fn field_element_to_hex(value: &FieldElement) -> String;
```

#### 4.1.5 JSON Serialization
- **TypeScript**: Native JSON support
- **Rust**: Use `serde` with `serde_json`

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct MyStruct {
    #[serde(rename = "fieldName")]
    pub field_name: String,
}
```

### 4.2 External Dependencies Mapping

| TypeScript Package | Rust Crate | Notes |
|-------------------|------------|-------|
| `ethers` | `alloy-rs` | Already using alloy in contracts.rs |
| `circomlibjs` | `circom-rs` + custom | MiMC, Poseidon implementations |
| `@zk-kit/eddsa-poseidon` | `babyjubjub-rs` + custom | EdDSA implementation |
| `fixed-merkle-tree` | Custom implementation | Merkle tree with MiMC/Keccak |
| `snarkjs` | `ark-circom` or FFI | Circuit proof generation |
| `poseidon-lite` | `poseidon-rs` | Poseidon hash |
| `@noble/curves` | `babyjubjub-rs` | Already included |
| `@noble/hashes` | `sha2`, `sha3` | Standard hash functions |
| `axios` | `reqwest` | HTTP client |
| `level` (LevelDB) | `sled` or `rocksdb` | Key-value store |

### 4.3 Recommended Crates

```toml
[dependencies]
# Core async runtime
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"

# Cryptography (already have some)
babyjubjub-rs = "0.0.11"
poseidon-rs = "0.0.8"
ark-bn254 = "0.4"
ark-circom = "0.1"

# Blockchain (already have)
alloy-sol-macro = { version = "1.4.0", features = ["json"] }
alloy-sol-types = "1.4.0"
alloy-contract = "1.0.38"
alloy-provider = "1.0"
alloy-signer = "1.0"

# Data structures
num-bigint = "0.4"
num-traits = "0.2"

# Serialization (already have)
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Error handling
thiserror = "2.0"
anyhow = "1.0"

# HTTP client
reqwest = { version = "0.12", features = ["json"] }

# Storage
sled = "0.34"

# Hashing
sha2 = "0.10"
sha3 = "0.10"
hex = "0.4"

# Utilities
bytes = "1.0"
base64 = "0.22"
```

### 4.4 Testing Strategy

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Unit tests for crypto primitives
    #[test]
    fn test_poseidon_hash() {
        let input = [FieldElement::from(42u64)];
        let hash = poseidon1(input);
        assert_ne!(hash, FieldElement::zero());
    }

    // Integration tests with local blockchain
    #[tokio::test]
    async fn test_seal_unseal_flow() {
        // Setup local ganache/anvil
        // Deploy contracts
        // Test full seal/unseal cycle
    }

    // Property-based tests
    #[quickcheck]
    fn prop_encrypt_decrypt(secret: u64) -> bool {
        let priv_key = gen_priv_key();
        let pub_key = gen_pub_key(priv_key);
        let encrypted = encrypt_ecc_babyjub(secret.into(), pub_key);
        let decrypted = decrypt_ecc_babyjub(&encrypted, priv_key);
        decrypted == secret.into()
    }
}
```

### 4.5 Performance Considerations

1. **Zero-Copy Operations**: Use `&[u8]` and `Cow<str>` where possible
2. **Parallel Processing**: Use `rayon` for parallel Merkle tree operations
3. **Caching**: Implement caching for contract calls and hash computations
4. **WASM Circuits**: Use WASM for circuit operations to match TypeScript behavior
5. **Memory Pools**: Consider using object pools for frequently allocated types

### 4.6 Implementation Phases

**Phase 1: Core Cryptography** (Week 1-2)
- Poseidon, MiMC hash functions
- Baby Jubjub curve operations
- EdDSA signatures
- Homomorphic encryption
- ECC encryption/decryption

**Phase 2: Data Structures** (Week 2-3)
- Merkle tree implementations
- Field element operations
- Type definitions

**Phase 3: Contract Integration** (Week 3-4)
- Extend existing contract bindings
- Ephemeral tree wrapper
- Chained proof wrapper
- Local VM executor

**Phase 4: Client Components** (Week 4-5)
- Sealing process
- Unsealing process
- State machines

**Phase 5: Server Components** (Week 5-6)
- Processor implementation
- Data stream server
- Persistence layer

**Phase 6: Reveal Methods** (Week 6-7)
- Chained proof logic
- Proof collections
- ZK proof integrations

**Phase 7: Integration & Testing** (Week 7-8)
- End-to-end tests
- Contract deployment
- Documentation
- Examples

### 4.7 Circuit Integration Strategy

Since circuits are in a separate package (`@nihilium/zkp-circuits`), decide on integration method:

**Option A: WASM Bindings**
```rust
// Use wasmer or wasmtime to run circuit WASM
use wasmer::{Store, Module, Instance};

pub struct WasmCircuit {
    instance: Instance,
}

impl WasmCircuit {
    pub fn from_wasm(wasm_bytes: &[u8]) -> Result<Self>;
    pub async fn generate_proof(&self, input: &serde_json::Value) -> Result<ProofOutput>;
}
```

**Option B: Native Rust Circuits**
```rust
// Re-implement circuits in Rust using ark-circom
use ark_circom::{CircomBuilder, CircomCircuit};

pub struct NativeCircuit {
    circuit: CircomCircuit<Bn254>,
}
```

**Option C: FFI to Node.js** (least recommended)
```rust
// Use neon for Node.js FFI
// More overhead, but can reuse existing circuits
```

**Recommended**: Option A (WASM) for compatibility, migrate to Option B (Native) for performance

### 4.8 Browser vs Node.js Considerations

The TypeScript library supports both browser and Node.js. For Rust:

- **Native Binary**: Full implementation for server-side use
- **WASM Target**: Compile to WASM for browser use

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
# WASM-specific dependencies
wasm-bindgen = { version = "0.2", optional = true }
web-sys = { version = "0.3", optional = true }

[features]
default = []
wasm = ["wasm-bindgen", "web-sys"]
```

### 4.9 Code Organization Best Practices

```rust
// Re-export commonly used types at crate root
pub use crypto::{BabyJubExtPoint, FieldElement, poseidon1, poseidon2};
pub use client::{ClientSingleShareSealingProcess, ClientSingleShareUnsealingProcess};
pub use types::{SingleSealStoragePackage, ProcessorEndpoint};

// Prelude module for convenience
pub mod prelude {
    pub use crate::crypto::*;
    pub use crate::client::*;
    pub use crate::types::*;
    pub use crate::Result;
}
```

### 4.10 Documentation Requirements

Each module should include:
- Module-level documentation explaining purpose and usage
- Function-level documentation with examples
- Safety notes for cryptographic operations
- Security considerations
- Performance characteristics

```rust
/// Seals a secret using homomorphic encryption and ZK proofs.
///
/// This function implements the sealing protocol which:
/// 1. Generates ephemeral keys
/// 2. Encrypts the secret using homomorphic encryption
/// 3. Creates a ZK proof of correct encryption
/// 4. Commits to reveal conditions
///
/// # Security
/// - Private key material is never exposed
/// - Randomness is cryptographically secure
/// - Proofs are verified before commitment
///
/// # Performance
/// - Proof generation: ~2-5 seconds
/// - Network round trip: ~500ms
/// - Total: ~3-6 seconds
///
/// # Example
/// ```rust
/// let mut process = ClientSingleShareSealingProcess::new(processor, collection);
/// process.initialize(secret, metadata_root).await?;
/// let package = process.request_commitment_to_processor(true).await?;
/// ```
pub async fn seal_secret(...) -> Result<SingleSealStoragePackage> { ... }
```

---

## Appendix A: Glossary

- **Baby Jubjub**: Twisted Edwards elliptic curve defined over BN254 scalar field
- **BN254**: Barreto-Naehrig pairing-friendly elliptic curve at 254-bit security level
- **Circom**: Circuit compiler for ZK-SNARKs
- **EdDSA**: Edwards-curve Digital Signature Algorithm
- **ElGamal**: Public-key cryptosystem based on discrete logarithm problem
- **Field Element**: Element of a finite field (modulo prime p)
- **HE**: Homomorphic Encryption - allows operations on encrypted data
- **MiMC**: Minimal Multiplicative Complexity hash function (ZK-friendly)
- **Poseidon**: ZK-SNARK-friendly hash function using sponge construction
- **Severed Commitment**: Unlinkable commitment preventing correlation between seal/unseal
- **TEE**: Trusted Execution Environment (e.g., Intel SGX)
- **ZK-SNARK**: Zero-Knowledge Succinct Non-Interactive Argument of Knowledge

---

## Appendix B: Security Considerations

### B.1 Cryptographic Security

1. **Random Number Generation**
   - Use `rand::rngs::OsRng` for all cryptographic randomness
   - Never use `rand::thread_rng()` for secrets
   - Zeroize sensitive data after use

2. **Field Operations**
   - Ensure all operations are modulo field prime
   - Validate inputs are within field bounds
   - Use constant-time operations where possible

3. **Key Management**
   - Private keys should never be logged
   - Use `zeroize` crate to clear memory
   - Consider using hardware security modules (HSMs)

### B.2 Protocol Security

1. **Replay Protection**
   - Each seal has unique reveal_value
   - Unsealing requires recent Merkle proofs

2. **Unlinkability**
   - Severed commitments prevent linking seal/unseal
   - Random values added at client side

3. **Processor Trust**
   - TEE/SGX recommended but not required
   - Multi-party computation could eliminate trust

### B.3 Implementation Security

1. **Input Validation**
   - Validate all hex strings
   - Check field element ranges
   - Verify proof formats

2. **Error Handling**
   - Don't leak sensitive info in errors
   - Use generic error messages for crypto failures
   - Log detailed errors internally only

3. **Side Channels**
   - Be aware of timing attacks
   - Use constant-time comparisons for secrets
   - Consider cache-timing attacks

---

## Appendix C: Performance Benchmarks (Target)

| Operation | Time (ms) | Notes |
|-----------|-----------|-------|
| Poseidon hash (1 input) | < 1 | Native |
| MiMC hash | < 1 | Native |
| EdDSA sign | 5-10 | Native |
| EdDSA verify | 10-20 | Native |
| HE encrypt (248 bits) | 50-100 | 8 point operations |
| HE decrypt | 50-100 | 8 point operations |
| ECC encrypt | 20-30 | Single point |
| ECC decrypt | 20-30 | Single point |
| Merkle tree insert | 5-10 | Depth 20 |
| Merkle proof generation | 10-20 | Depth 20 |
| Seal request | 2000-5000 | Includes proof gen |
| Unseal request | 3000-6000 | Includes proof gen + chain |
| Contract call (local VM) | 1-5 | Cached |
| Contract call (network) | 100-500 | RPC latency |

---

## Appendix D: Example Usage Flows

### D.1 Complete Seal/Unseal Flow

```rust
use nihilium_primitives::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Setup
    let provider = get_provider("http://localhost:8545").await?;
    let signer = get_signer()?;

    // Initialize data stream
    let mut data_stream = DataStreamClient::new(
        "http://datastream.example.com".to_string()
    );
    data_stream.initialize().await?;

    // Create processor endpoint
    let processor = ProcessorEndpoint {
        url: "http://processor.example.com".to_string(),
        is_tor: false,
        public_verification_key: [/* ... */],
        public_he_encryption_key: [/* ... */],
        server_address: "0x...".to_string(),
    };

    // Create reveal collection
    let collection = RevealOnlyCollection::new(
        "0xChainedProofAddress".to_string(),
        vec![Box::new(data_stream)],
        Some(provider.clone()),
        Some(signer.clone()),
    );

    // === SEALING ===

    // Initialize sealing process
    let mut sealing = ClientSingleShareSealingProcess::new(
        processor.clone(),
        Box::new(collection),
    );

    let secret = FieldElement::from(42u64);
    let metadata = FieldElement::from(100u64);

    sealing.initialize(secret, metadata).await?;

    // Request seal from processor
    let seal_package = sealing
        .request_commitment_to_processor(true)
        .await?;

    // Store seal package securely
    store_seal_package(&seal_package)?;

    // Publish reveal value to data stream
    // (In real scenario, this happens when ready to unseal)

    // === UNSEALING ===

    // Load seal package
    let seal_package = load_seal_package()?;

    // Create reveal collection (same config)
    let collection = RevealOnlyCollection::new(/* ... */);

    // Initialize unsealing process
    let mut unsealing = ClientSingleShareUnsealingProcess::new(
        processor.clone(),
        Box::new(collection),
        seal_package,
    );

    unsealing.initialize().await?;

    // Publish reveal value to data stream
    unsealing.publish_reveal_value("").await?;

    // Wait for value to become provable
    unsealing.await_reveal_value_to_be_provable(None).await?;

    // Request unseal from processor
    let unseal_response = unsealing
        .unseal_request_to_processor()
        .await?;

    // Decrypt the secret
    let decrypted_secret = unsealing
        .process_unseal_response(unseal_response, None)
        .await?;

    assert_eq!(decrypted_secret, secret);

    println!("Successfully unsealed secret: {:?}", decrypted_secret);

    Ok(())
}
```
