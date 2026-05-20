/**
 * StakeManager
 *
 * Wraps the stake-related functions of ProcessorRegistry / DatastreamRegistry
 * for a single operator account.  Both registry contracts expose identical
 * stake-function signatures, so this class works for both.
 *
 * Staking model
 * ─────────────
 *   addStake(token, amount)              — deposit ETH or approved ERC-20
 *   signalStakeRemoval(token, amount)    — reserve amount, start grace-period
 *   finalizeStakeRemoval(token)          — withdraw after grace period elapsed
 *
 * ETH is represented as token = ethers.ZeroAddress.
 * For ERC-20 tokens this class automatically approves the registry contract to
 * spend `MaxUint256` the first time the allowance is too low.
 */

import {
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  MaxUint256,
  Contract,
  ContractTransactionResponse,
} from "ethers";
import type { InterfaceAbi } from "ethers";
import type { StakeManagerConfig, PendingRemoval } from "./types";
import { processorRegistryAbi } from "./abis";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

export class StakeManager {
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly contract: Contract;
  private readonly contractAddress: string;

  /**
   * @param config  Connection and auth config.
   * @param abi     ABI of the registry contract.  Defaults to
   *                `processorRegistryAbi` (identical stake signatures for both
   *                processor and datastream registries).
   */
  constructor(config: StakeManagerConfig, abi: InterfaceAbi = processorRegistryAbi) {
    this.provider        = new JsonRpcProvider(config.rpcEndpoint);
    this.signer          = new Wallet(config.ethPrivateKey, this.provider);
    this.contractAddress = config.contractAddress;
    this.contract        = new Contract(config.contractAddress, abi, this.signer);
  }

  // -------------------------------------------------------------------------
  // Deposits
  // -------------------------------------------------------------------------

  /**
   * Deposit stake.
   *
   * @param token   Token address.  Pass `ethers.ZeroAddress` for native ETH.
   * @param amount  Amount in the token's smallest unit (wei for ETH).
   */
  async addStake(token: string, amount: bigint): Promise<ContractTransactionResponse> {
    if (amount <= 0n) throw new Error("StakeManager: amount must be > 0");

    if (token === ZeroAddress) {
      return this._call("addStake", ZeroAddress, amount, { value: amount });
    }

    await this._ensureAllowance(token, amount);
    return this._call("addStake", token, amount);
  }

  // -------------------------------------------------------------------------
  // Stake removal
  // -------------------------------------------------------------------------

  /**
   * Signal intent to remove `amount` of `token` stake.
   * The amount is reserved immediately; withdrawal is possible after the
   * grace period elapses.
   */
  async signalStakeRemoval(token: string, amount: bigint): Promise<ContractTransactionResponse> {
    const t = this._canonical(token);
    const current = await this.getStake(t);
    if (current < amount) {
      throw new Error(
        `StakeManager: insufficient stake — have ${current}, requested ${amount}`
      );
    }
    const pending = await this.getPendingRemoval(t);
    if (pending !== null) {
      throw new Error(
        `StakeManager: removal already pending for this token` +
        ` (amount: ${pending.amount}, withdrawable at block ${pending.withdrawableAtBlock})`
      );
    }
    return this._call("signalStakeRemoval", t, amount);
  }

  /**
   * Finalise a previously-signalled stake removal.
   * Throws with a human-readable message if the grace period has not elapsed.
   */
  async finalizeStakeRemoval(token: string): Promise<ContractTransactionResponse> {
    const t = this._canonical(token);
    const pending = await this.getPendingRemoval(t);
    if (pending === null) {
      throw new Error("StakeManager: no pending removal for this token");
    }
    const currentBlock = BigInt(await this.provider.getBlockNumber());
    if (currentBlock < pending.withdrawableAtBlock) {
      const remaining = pending.withdrawableAtBlock - currentBlock;
      throw new Error(
        `StakeManager: grace period not elapsed — ${remaining} block(s) remaining`
      );
    }
    return this._call("finalizeStakeRemoval", t);
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  /** Active (non-reserved) stake for the signer's account. */
  async getStake(token: string): Promise<bigint> {
    return this.contract.stakes(await this.signer.getAddress(), this._canonical(token)) as Promise<bigint>;
  }

  /** Returns the pending removal record, or null if none exists. */
  async getPendingRemoval(token: string): Promise<PendingRemoval | null> {
    const t = this._canonical(token);
    const address = await this.signer.getAddress();
    const [amount, signaledAtBlock]: [bigint, bigint] =
      await this.contract.pendingRemovals(address, t) as [bigint, bigint];
    if (signaledAtBlock === 0n) return null;

    const withdrawableAtBlock: bigint =
      await this.contract.removalAvailableAtBlock(address, t) as bigint;
    return { token: t, amount, signaledAtBlock, withdrawableAtBlock };
  }

  /** Block number after which `finalizeStakeRemoval` will succeed. Returns 0n if none pending. */
  async removalAvailableAtBlock(token: string): Promise<bigint> {
    return this.contract.removalAvailableAtBlock(
      await this.signer.getAddress(),
      this._canonical(token)
    ) as Promise<bigint>;
  }

  /** All committee-approved ERC-20 stake tokens (ETH not listed, always valid). */
  async getAllowedTokens(): Promise<string[]> {
    return this.contract.getAllowedTokens() as Promise<string[]>;
  }

  /** Whether the given ERC-20 is approved for staking (ETH always returns true). */
  async isTokenAllowed(token: string): Promise<boolean> {
    if (this._canonical(token) === ZeroAddress) return true;
    return this.contract.allowedStakeTokens(token) as Promise<boolean>;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _canonical(token: string): string {
    return token === "0x0" ? ZeroAddress : token;
  }

  private _call(fn: string, ...args: unknown[]): Promise<ContractTransactionResponse> {
    return (this.contract[fn] as (...a: unknown[]) => Promise<ContractTransactionResponse>)(...args);
  }

  private async _ensureAllowance(token: string, amount: bigint): Promise<void> {
    const erc20    = new Contract(token, ERC20_ABI, this.signer);
    const owner    = await this.signer.getAddress();
    const allowance: bigint =
      await (erc20.allowance as (a: string, b: string) => Promise<bigint>)(owner, this.contractAddress);
    if (allowance < amount) {
      const tx = await (erc20.approve as (a: string, b: bigint) => Promise<ContractTransactionResponse>)(
        this.contractAddress, MaxUint256
      );
      await tx.wait();
    }
  }
}
