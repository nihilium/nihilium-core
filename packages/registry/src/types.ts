/**
 * Shared TypeScript types for the Nihilium registry client library.
 */

// ---------------------------------------------------------------------------
// Processor / Datastream metadata
// ---------------------------------------------------------------------------

export interface ProcessorMetadata {
  name: string;
  description: string;
  /** Clearnet API endpoint (e.g. https://processor.example.com) */
  url: string;
  /** .onion address (empty string if not available) */
  tor: string;
}

// ---------------------------------------------------------------------------
// Registration config
// ---------------------------------------------------------------------------

export interface ProcessorConfig {
  /** 0x-prefixed 32-byte Ethereum private key (used for signing transactions). */
  ethPrivateKey: string;

  /**
   * Zero or more Baby Jubjub private keys used for Homomorphic Encryption
   * (ECElGamal composite-key sealing, §6.2).
   * Each key is a 0x-prefixed 32-byte hex scalar.
   */
  hePrivateKeys: string[];

  /**
   * Zero or more Baby Jubjub private keys used for EdDSA signing
   * (sealing commitments, §6.4).
   * Each key is a 0x-prefixed 32-byte hex scalar.
   */
  signingPrivateKeys: string[];

  /** JSON-RPC endpoint (e.g. wss://mainnet.infura.io/ws/v3/… or http://127.0.0.1:8545) */
  rpcEndpoint: string;

  /** Deployed ProcessorRegistry contract address. */
  contractAddress: string;

  /** Human-readable metadata for the processor record. */
  metadata: ProcessorMetadata;

  /**
   * Minimum blocks that must elapse between signalling stake removal and
   * finalising it.  Only used during the initial `register()` call;
   * ignored if the processor is already registered.
   */
  gracePeriodBlocks: number;
}

// ---------------------------------------------------------------------------
// Stake
// ---------------------------------------------------------------------------

export interface StakeManagerConfig {
  /** 0x-prefixed 32-byte Ethereum private key. */
  ethPrivateKey: string;

  /** JSON-RPC endpoint. */
  rpcEndpoint: string;

  /** Deployed ProcessorRegistry (or DatastreamRegistry) contract address. */
  contractAddress: string;
}

export interface PendingRemoval {
  /** Token address; use `ethers.ZeroAddress` (all-zeros) for ETH. */
  token: string;
  /** Amount pending withdrawal (in token's smallest unit). */
  amount: bigint;
  /** Block at which the removal was signalled. */
  signaledAtBlock: bigint;
  /** Block after which `finalizeStakeRemoval` will succeed. */
  withdrawableAtBlock: bigint;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export type KeyType = "HE" | "Signing";

export interface KeyRecord {
  /** keccak256(keyX ++ keyY) — the on-chain key identifier. */
  keyId: string;
  keyX: bigint;
  keyY: bigint;
  keyType: KeyType;
  /** Ethereum address of the owning processor. */
  owner: string;
  /** true iff deactivatedAt == 0 on-chain. */
  isActive: boolean;
  /** Block timestamp at which the key was deactivated, or 0n if still active. */
  deactivatedAt: bigint;
}

// ---------------------------------------------------------------------------
// On-chain processor info snapshot
// ---------------------------------------------------------------------------

export interface ProcessorOnChainInfo {
  address: string;
  isActive: boolean;
  gracePeriodBlocks: bigint;
  pendingGracePeriodBlocks: bigint;
  pendingGracePeriodRequestedAt: bigint;
  metadata: ProcessorMetadata;
  keys: KeyRecord[];
}
