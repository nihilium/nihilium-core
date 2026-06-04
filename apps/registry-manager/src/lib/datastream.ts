/**
 * Datastream registry business logic
 *
 * Mirrors src/lib/processor.ts but for DatastreamClient.
 * Pure async functions — zero terminal I/O.
 */

import { DatastreamClient } from "@nihilium/registry";
import type { PendingRemoval } from "@nihilium/registry";
import type {
  DatastreamConfig,
  DatastreamMetadata,
  DatastreamOnChainInfo,
  DatastreamKeyRecord,
} from "@nihilium/registry";
import { ZeroAddress } from "ethers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StakeRow {
  token:   string;
  label:   string;
  active:  bigint;
  pending: PendingRemoval | null;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function client(cfg: DatastreamConfig): Promise<DatastreamClient> {
  const c = new DatastreamClient(cfg);
  await c.init();
  return c;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function getDatastreamStatus(cfg: DatastreamConfig): Promise<DatastreamOnChainInfo> {
  return (await client(cfg)).getOnChainInfo();
}

export async function registerDatastream(cfg: DatastreamConfig): Promise<void> {
  const c = await client(cfg);
  await c.register();
  await c.addAllKeys();
}

export async function updateDatastreamMetadata(
  cfg: DatastreamConfig,
  metadata: DatastreamMetadata
): Promise<void> {
  const c = await client(cfg);
  await c.updateMetadata(metadata);
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export async function getActiveKeys(cfg: DatastreamConfig): Promise<DatastreamKeyRecord[]> {
  return (await client(cfg)).getActiveKeys();
}

export async function getAllKeys(cfg: DatastreamConfig): Promise<DatastreamKeyRecord[]> {
  return (await (await client(cfg)).getOnChainInfo()).keys;
}

export async function deactivateKey(cfg: DatastreamConfig, keyId: string): Promise<void> {
  await (await client(cfg)).deactivateKey(keyId);
}

// ---------------------------------------------------------------------------
// Stake management
// ---------------------------------------------------------------------------

export async function getStakes(cfg: DatastreamConfig): Promise<StakeRow[]> {
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

export async function getAllowedTokens(cfg: DatastreamConfig): Promise<string[]> {
  return (await client(cfg)).stake.getAllowedTokens();
}

export async function addStake(
  cfg: DatastreamConfig,
  token: string,
  amount: bigint
): Promise<void> {
  const tx = await (await client(cfg)).stake.addStake(token, amount);
  await tx.wait();
}

export async function signalStakeRemoval(
  cfg: DatastreamConfig,
  token: string,
  amount: bigint
): Promise<void> {
  const tx = await (await client(cfg)).stake.signalStakeRemoval(token, amount);
  await tx.wait();
}

export async function finalizeStakeRemoval(
  cfg: DatastreamConfig,
  token: string
): Promise<void> {
  const tx = await (await client(cfg)).stake.finalizeStakeRemoval(token);
  await tx.wait();
}
