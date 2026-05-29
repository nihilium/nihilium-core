/**
 * Processor registry business logic
 *
 * Pure async functions — no terminal I/O, no formatting, no prompts.
 * Every function accepts a ProcessorConfig, creates a short-lived
 * ProcessorClient, and returns plain typed data.
 *
 * This is the layer that a future Express dashboard would import directly
 * and expose via JSON endpoints.
 */

import { ProcessorClient } from "@nihilium/registry";
import type {
  ProcessorConfig,
  ProcessorOnChainInfo,
  KeyRecord,
  PendingRemoval,
} from "@nihilium/registry";
import { ZeroAddress } from "ethers";

// ---------------------------------------------------------------------------
// Types returned by lib functions
// ---------------------------------------------------------------------------

export interface StakeRow {
  token:    string; // address; ZeroAddress = ETH
  label:    string; // "ETH" or shortened ERC-20 address
  active:   bigint;
  pending:  PendingRemoval | null;
}

// ---------------------------------------------------------------------------
// Internal helper: build a fully initialised client
// ---------------------------------------------------------------------------

async function client(cfg: ProcessorConfig): Promise<ProcessorClient> {
  const c = new ProcessorClient(cfg);
  await c.init();
  return c;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Returns the full on-chain info snapshot. */
export async function getProcessorStatus(cfg: ProcessorConfig): Promise<ProcessorOnChainInfo> {
  return (await client(cfg)).getOnChainInfo();
}

/**
 * Idempotent register + add all keys from config.
 * Safe to call repeatedly; already-registered processors and keys are skipped.
 */
export async function registerProcessor(cfg: ProcessorConfig): Promise<void> {
  const c = await client(cfg);
  await c.register();
  await c.addAllKeys();
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export async function getActiveKeys(cfg: ProcessorConfig): Promise<KeyRecord[]> {
  return (await client(cfg)).getActiveKeys();
}

export async function getAllKeys(cfg: ProcessorConfig): Promise<KeyRecord[]> {
  return (await (await client(cfg)).getOnChainInfo()).keys;
}

export async function deactivateKey(cfg: ProcessorConfig, keyId: string): Promise<void> {
  await (await client(cfg)).deactivateKey(keyId);
}

export async function deriveProcessorPublicKey(
  cfg: ProcessorConfig,
  privateKey: string,
  keyType: "HE" | "Signing"
): Promise<{ x: bigint; y: bigint; keyId: string }> {
  return new ProcessorClient(cfg).derivePublicKey(privateKey, keyType);
}

export async function deriveConfiguredProcessorPublicKeys(
  cfg: ProcessorConfig
): Promise<Array<{ keyType: "HE" | "Signing"; privateKey: string; x: bigint; y: bigint; keyId: string }>> {
  const c = new ProcessorClient(cfg);
  const out: Array<{ keyType: "HE" | "Signing"; privateKey: string; x: bigint; y: bigint; keyId: string }> = [];

  for (const privateKey of cfg.hePrivateKeys) {
    const derived = await c.derivePublicKey(privateKey, "HE");
    out.push({ keyType: "HE", privateKey, ...derived });
  }
  for (const privateKey of cfg.signingPrivateKeys) {
    const derived = await c.derivePublicKey(privateKey, "Signing");
    out.push({ keyType: "Signing", privateKey, ...derived });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Stake management
// ---------------------------------------------------------------------------

/**
 * Return stake rows for ETH and every committee-approved ERC-20 token.
 * Each row shows the active balance and any pending removal.
 */
export async function getStakes(cfg: ProcessorConfig): Promise<StakeRow[]> {
  const c = await client(cfg);
  const tokens = [ZeroAddress, ...(await c.stake.getAllowedTokens())];

  return Promise.all(
    tokens.map(async (token) => ({
      token,
      label:   token === ZeroAddress ? "ETH" : token,
      active:  await c.stake.getStake(token),
      pending: await c.stake.getPendingRemoval(token),
    }))
  );
}

export async function getAllowedTokens(cfg: ProcessorConfig): Promise<string[]> {
  return (await client(cfg)).stake.getAllowedTokens();
}

export async function addStake(
  cfg: ProcessorConfig,
  token: string,
  amount: bigint
): Promise<void> {
  const tx = await (await client(cfg)).stake.addStake(token, amount);
  await tx.wait();
}

export async function signalStakeRemoval(
  cfg: ProcessorConfig,
  token: string,
  amount: bigint
): Promise<void> {
  const tx = await (await client(cfg)).stake.signalStakeRemoval(token, amount);
  await tx.wait();
}

export async function finalizeStakeRemoval(
  cfg: ProcessorConfig,
  token: string
): Promise<void> {
  const tx = await (await client(cfg)).stake.finalizeStakeRemoval(token);
  await tx.wait();
}
