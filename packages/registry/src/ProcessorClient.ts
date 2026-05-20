/**
 * ProcessorClient
 *
 * High-level TypeScript wrapper for ProcessorRegistry.sol.
 *
 * Lifecycle
 * ─────────
 *   const client = new ProcessorClient(config);
 *   await client.init();          // syncs on-chain registration state
 *   await client.register();      // idempotent — skips if already registered
 *   await client.addAllKeys();    // idempotent — skips already-registered keys
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
  buildProcessorKeyChallenge,
  generateSchnorrProof,
  keyId as computeKeyId,
  isOnCurve,
  isIdentity,
} from "./babyjubjub";
import { StakeManager } from "./StakeManager";
import { processorRegistryAbi } from "./abis";
import type {
  ProcessorConfig,
  ProcessorMetadata,
  KeyRecord,
  KeyType,
  ProcessorOnChainInfo,
} from "./types";

export class ProcessorClient {
  private readonly config: ProcessorConfig;
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly contract: Contract;

  /** Stake and unstake operations for this processor account. */
  readonly stake: StakeManager;

  private _registered = false;
  private _address    = "";
  private _chainId    = 0n;
  private _initialised = false;

  constructor(config: ProcessorConfig) {
    this.config   = { ...config };
    this.provider = new JsonRpcProvider(config.rpcEndpoint);
    this.signer   = new Wallet(config.ethPrivateKey, this.provider);
    this.contract = new Contract(config.contractAddress, processorRegistryAbi, this.signer);
    this.stake    = new StakeManager(
      {
        ethPrivateKey:   config.ethPrivateKey,
        rpcEndpoint:     config.rpcEndpoint,
        contractAddress: config.contractAddress,
      },
      processorRegistryAbi
    );
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Read the current on-chain registration state.
   * Must be called before `register()` or any key/metadata method.
   * Safe to call multiple times to refresh.
   */
  async init(): Promise<void> {
    this._address    = await this.signer.getAddress();
    this._chainId    = (await this.provider.getNetwork()).chainId;
    this._registered = await this.contract.isActive(this._address) as boolean;
    this._initialised = true;
  }

  // -------------------------------------------------------------------------
  // Registration (idempotent)
  // -------------------------------------------------------------------------

  /**
   * Register this processor on-chain.
   * Idempotent — performs a live `isActive` check and returns immediately if
   * already registered without submitting a transaction.
   */
  async register(): Promise<void> {
    this._requireInit();
    if (await this.contract.isActive(this._address) as boolean) {
      this._registered = true;
      return;
    }
    const { gracePeriodBlocks, metadata } = this.config;
    const tx: ContractTransactionResponse = await this.contract.register(
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
   * Add a single Baby Jubjub key to the registry.
   * Idempotent — skips silently if the derived public key already has a
   * registered owner on-chain.
   *
   * @param hexPrivateKey  0x-prefixed 32-byte BJJ private key scalar
   * @param keyType        "HE" or "Signing"
   */
  async addKey(hexPrivateKey: string, keyType: KeyType): Promise<void> {
    this._requireRegistered();

    const [keyX, keyY] = privateToPublic(hexPrivateKey);
    if (!isOnCurve(keyX, keyY)) {
      throw new Error(`ProcessorClient: derived public key is not on curve (${keyType})`);
    }
    if (isIdentity(keyX, keyY)) {
      throw new Error(`ProcessorClient: derived public key is identity point (${keyType})`);
    }

    // Idempotency check: if owner != ZeroAddress the key is already registered.
    const id = computeKeyId(keyX, keyY);
    const existing = await this.contract.keys(id) as [bigint, bigint, bigint, string, bigint];
    if (existing[3] !== ZeroAddress) return; // already registered

    const keyTypeUint = keyType === "HE" ? 0 : 1;
    const challenge = buildProcessorKeyChallenge(
      this._address, keyX, keyY, keyTypeUint as 0 | 1,
      this.config.contractAddress, this._chainId
    );
    const { Rx, Ry, s } = generateSchnorrProof(hexPrivateKey, challenge);

    const tx: ContractTransactionResponse = await this.contract.addKey(
      keyX, keyY, keyTypeUint, Rx, Ry, s
    ) as ContractTransactionResponse;
    await tx.wait();
  }

  /**
   * Add all HE and Signing keys from the config.
   * Idempotent — already-registered keys are skipped.
   */
  async addAllKeys(): Promise<void> {
    this._requireRegistered();
    for (const k of this.config.hePrivateKeys)      await this.addKey(k, "HE");
    for (const k of this.config.signingPrivateKeys)  await this.addKey(k, "Signing");
  }

  /**
   * Deactivate a key by its on-chain keyId (`keccak256(keyX ++ keyY)`).
   * Idempotent — no-op if the key is already inactive.
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

  async updateMetadata(metadata: ProcessorMetadata): Promise<void> {
    this._requireRegistered();
    const tx = await this.contract.updateMetadata(
      metadata.name, metadata.description, metadata.url, metadata.tor
    ) as ContractTransactionResponse;
    await tx.wait();
  }

  // -------------------------------------------------------------------------
  // Grace period management
  // -------------------------------------------------------------------------

  /**
   * Queue a grace period change.  The change does not take effect until
   * `applyPendingGracePeriod()` is called after the current grace period
   * elapses from the request block.
   */
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

  /** Cached registration flag (true after a successful `register()` or `init()`). */
  get registered(): boolean { return this._registered; }

  /** Ethereum address derived from `ethPrivateKey`. */
  get address(): string { return this._address; }

  /** Full on-chain state for this processor including all keys. */
  async getOnChainInfo(): Promise<ProcessorOnChainInfo> {
    this._requireInit();

    type InfoTuple = [bigint, bigint, bigint, boolean, [string, string, string, string]];
    const info = await this.contract.getProcessorInfo(this._address) as InfoTuple;
    const [gracePeriodBlocks, pendingGrace, pendingGraceAt, active, meta] = info;

    const keyIds = await this.contract.getProcessorKeys(this._address) as string[];
    const keys: KeyRecord[] = await Promise.all(keyIds.map(async (id) => {
      const k = await this.contract.keys(id) as [bigint, bigint, bigint, string, bigint];
      return {
        keyId:         id,
        keyX:          k[0],
        keyY:          k[1],
        keyType:       (k[2] === 0n ? "HE" : "Signing") as KeyType,
        owner:         k[3],
        isActive:      k[4] === 0n,
        deactivatedAt: k[4],
      };
    }));

    return {
      address:                       this._address,
      isActive:                      active,
      gracePeriodBlocks,
      pendingGracePeriodBlocks:      pendingGrace,
      pendingGracePeriodRequestedAt: pendingGraceAt,
      metadata: { name: meta[0], description: meta[1], url: meta[2], tor: meta[3] },
      keys,
    };
  }

  /** Only the currently-active (non-deactivated) keys. */
  async getActiveKeys(): Promise<KeyRecord[]> {
    return (await this.getOnChainInfo()).keys.filter((k) => k.isActive);
  }

  /**
   * Derive the public key coordinates for a given private key without touching
   * the network — useful for pre-computing key IDs or sanity checks.
   */
  derivePublicKey(hexPrivateKey: string): { x: bigint; y: bigint; keyId: string } {
    const [x, y] = privateToPublic(hexPrivateKey);
    return { x, y, keyId: computeKeyId(x, y) };
  }

  // -------------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------------

  private _requireInit(): void {
    if (!this._initialised) {
      throw new Error("ProcessorClient: call init() before using this method");
    }
  }

  private _requireRegistered(): void {
    this._requireInit();
    if (!this._registered) {
      throw new Error("ProcessorClient: not registered — call register() first");
    }
  }
}
