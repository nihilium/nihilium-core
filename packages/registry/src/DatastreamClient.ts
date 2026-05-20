/**
 * DatastreamClient
 *
 * High-level TypeScript wrapper for DatastreamRegistry.sol, targeting operators
 * who run Nihilium datastream nodes.
 *
 * Datastream operators register an IDataStream contract address alongside
 * their metadata.  They hold only Signing keys (no HE keys).
 *
 * Lifecycle
 * ─────────
 *   const client = new DatastreamClient(config);
 *   await client.init();
 *   await client.register();           // idempotent
 *   await client.addAllKeys();         // idempotent
 *   await client.stake.addStake(ZeroAddress, parseEther("1"));
 */

import {
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  Contract,
  ContractTransactionResponse,
} from "ethers";
import {
  privateToPublic,
  buildDatastreamKeyChallenge,
  generateSchnorrProof,
  keyId as computeKeyId,
  isOnCurve,
  isIdentity,
} from "./babyjubjub";
import { StakeManager } from "./StakeManager";
import { datastreamRegistryAbi } from "./abis";
import type { ProcessorMetadata, PendingRemoval, StakeManagerConfig } from "./types";

// ---------------------------------------------------------------------------
// Datastream-specific types
// ---------------------------------------------------------------------------

export interface DatastreamMetadata {
  name:        string;
  description: string;
  url:         string;
  tor:         string;
}

export interface DatastreamConfig {
  /** 0x-prefixed 32-byte Ethereum private key (signs transactions). */
  ethPrivateKey: string;

  /**
   * Zero or more Baby Jubjub signing private keys (EdDSA, sealing commitments).
   * Each is a 0x-prefixed 32-byte hex scalar.
   */
  signingPrivateKeys: string[];

  /** JSON-RPC endpoint. */
  rpcEndpoint: string;

  /** Deployed DatastreamRegistry contract address. */
  contractAddress: string;

  /** Address of the deployed IDataStream contract to register. */
  datastreamContract: string;

  metadata: DatastreamMetadata;

  /**
   * Minimum blocks between signalling stake removal and finalising it.
   * Used only during the initial `register()` call.
   */
  gracePeriodBlocks: number;
}

export interface DatastreamKeyRecord {
  keyId:         string;
  keyX:          bigint;
  keyY:          bigint;
  owner:         string;
  isActive:      boolean;
  deactivatedAt: bigint;
}

export interface DatastreamOnChainInfo {
  address:                       string;
  isActive:                      boolean;
  contractAddress:               string;
  gracePeriodBlocks:             bigint;
  pendingGracePeriodBlocks:      bigint;
  pendingGracePeriodRequestedAt: bigint;
  metadata:                      DatastreamMetadata;
  keys:                          DatastreamKeyRecord[];
}

// ---------------------------------------------------------------------------
// DatastreamClient
// ---------------------------------------------------------------------------

export class DatastreamClient {
  private readonly config: DatastreamConfig;
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly contract: Contract;

  /** Stake and unstake operations for this datastream operator account. */
  readonly stake: StakeManager;

  private _registered  = false;
  private _address     = "";
  private _chainId     = 0n;
  private _initialised = false;

  constructor(config: DatastreamConfig) {
    this.config   = { ...config };
    this.provider = new JsonRpcProvider(config.rpcEndpoint);
    this.signer   = new Wallet(config.ethPrivateKey, this.provider);
    this.contract = new Contract(config.contractAddress, datastreamRegistryAbi, this.signer);
    this.stake    = new StakeManager(
      {
        ethPrivateKey:   config.ethPrivateKey,
        rpcEndpoint:     config.rpcEndpoint,
        contractAddress: config.contractAddress,
      } satisfies StakeManagerConfig,
      datastreamRegistryAbi
    );
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Fetch the current on-chain registration state.
   * Must be called before any write or view method.
   */
  async init(): Promise<void> {
    this._address     = await this.signer.getAddress();
    this._chainId     = (await this.provider.getNetwork()).chainId;
    this._registered  = await this.contract.isActiveOperator(this._address) as boolean;
    this._initialised = true;
  }

  // -------------------------------------------------------------------------
  // Registration (idempotent)
  // -------------------------------------------------------------------------

  /**
   * Register this datastream operator on-chain.
   * Idempotent — performs a live `isActiveOperator` check and returns without a
   * transaction if already registered.
   */
  async register(): Promise<void> {
    this._requireInit();
    if (await this.contract.isActiveOperator(this._address) as boolean) {
      this._registered = true;
      return;
    }
    const { gracePeriodBlocks, metadata, datastreamContract } = this.config;
    const tx: ContractTransactionResponse = await this.contract.register(
      datastreamContract,
      BigInt(gracePeriodBlocks),
      metadata.name,
      metadata.description,
      metadata.url,
      metadata.tor
    ) as ContractTransactionResponse;
    await tx.wait();
    this._registered = true;
  }

  // -------------------------------------------------------------------------
  // Key management
  // -------------------------------------------------------------------------

  /**
   * Add a single Baby Jubjub signing key.
   * Idempotent — no-op if the key already has a registered owner on-chain.
   *
   * @param hexPrivateKey  0x-prefixed 32-byte BJJ private key scalar
   */
  async addKey(hexPrivateKey: string): Promise<void> {
    this._requireRegistered();

    const [keyX, keyY] = privateToPublic(hexPrivateKey);
    if (!isOnCurve(keyX, keyY)) {
      throw new Error("DatastreamClient: derived public key is not on curve");
    }
    if (isIdentity(keyX, keyY)) {
      throw new Error("DatastreamClient: derived public key is identity point");
    }

    const id = computeKeyId(keyX, keyY);
    const existing = await this.contract.keys(id) as [bigint, bigint, string, bigint];
    if (existing[2] !== ZeroAddress) return; // already registered (owner != 0)

    const challenge = buildDatastreamKeyChallenge(
      this._address, keyX, keyY,
      this.config.contractAddress, this._chainId
    );
    const { Rx, Ry, s } = generateSchnorrProof(hexPrivateKey, challenge);

    const tx: ContractTransactionResponse = await this.contract.addKey(
      keyX, keyY, Rx, Ry, s
    ) as ContractTransactionResponse;
    await tx.wait();
  }

  /** Add all signing keys from the config.  Idempotent — skips already-registered keys. */
  async addAllKeys(): Promise<void> {
    this._requireRegistered();
    for (const k of this.config.signingPrivateKeys) await this.addKey(k);
  }

  /**
   * Deactivate a key by its keyId.  Idempotent — no-op if already inactive.
   */
  async deactivateKey(id: string): Promise<void> {
    this._requireRegistered();
    if (!await this.contract.isKeyActive(id) as boolean) return;
    const tx = await this.contract.deactivateKey(id) as ContractTransactionResponse;
    await tx.wait();
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  async updateMetadata(metadata: DatastreamMetadata): Promise<void> {
    this._requireRegistered();
    const tx = await this.contract.updateMetadata(
      metadata.name, metadata.description, metadata.url, metadata.tor
    ) as ContractTransactionResponse;
    await tx.wait();
  }

  // -------------------------------------------------------------------------
  // Grace period management
  // -------------------------------------------------------------------------

  async setGracePeriod(blocks: number): Promise<void> {
    this._requireRegistered();
    const tx = await this.contract.setGracePeriod(BigInt(blocks)) as ContractTransactionResponse;
    await tx.wait();
  }

  async applyPendingGracePeriod(): Promise<void> {
    this._requireRegistered();
    const tx = await this.contract.applyPendingGracePeriod() as ContractTransactionResponse;
    await tx.wait();
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  get registered(): boolean { return this._registered; }
  get address(): string     { return this._address; }

  /** Full on-chain state for this datastream operator including all keys. */
  async getOnChainInfo(): Promise<DatastreamOnChainInfo> {
    this._requireInit();

    type InfoTuple = [string, bigint, bigint, bigint, boolean, [string, string, string, string]];
    const info = await this.contract.getDatastreamInfo(this._address) as InfoTuple;
    const [contractAddress, gracePeriodBlocks, pendingGrace, pendingGraceAt, active, meta] = info;

    const keyIds = await this.contract.getOperatorKeys(this._address) as string[];
    const keys: DatastreamKeyRecord[] = await Promise.all(keyIds.map(async (id) => {
      const k = await this.contract.keys(id) as [bigint, bigint, string, bigint];
      return {
        keyId:         id,
        keyX:          k[0],
        keyY:          k[1],
        owner:         k[2],
        isActive:      k[3] === 0n,
        deactivatedAt: k[3],
      };
    }));

    return {
      address:                       this._address,
      isActive:                      active,
      contractAddress,
      gracePeriodBlocks,
      pendingGracePeriodBlocks:      pendingGrace,
      pendingGracePeriodRequestedAt: pendingGraceAt,
      metadata: { name: meta[0], description: meta[1], url: meta[2], tor: meta[3] },
      keys,
    };
  }

  async getActiveKeys(): Promise<DatastreamKeyRecord[]> {
    return (await this.getOnChainInfo()).keys.filter((k) => k.isActive);
  }

  derivePublicKey(hexPrivateKey: string): { x: bigint; y: bigint; keyId: string } {
    const [x, y] = privateToPublic(hexPrivateKey);
    return { x, y, keyId: computeKeyId(x, y) };
  }

  // -------------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------------

  private _requireInit(): void {
    if (!this._initialised) {
      throw new Error("DatastreamClient: call init() before using this method");
    }
  }

  private _requireRegistered(): void {
    this._requireInit();
    if (!this._registered) {
      throw new Error("DatastreamClient: not registered — call register() first");
    }
  }
}
