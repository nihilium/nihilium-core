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

import { ProcessorClient, keyId as computeKeyId } from "@nihilium/registry";
import type {
  ProcessorConfig,
  ProcessorMetadata,
  ProcessorOnChainInfo,
  KeyRecord,
  KeyType,
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

/** Push metadata to the registry (must already be registered). */
export async function updateProcessorMetadata(
  cfg: ProcessorConfig,
  metadata: ProcessorMetadata
): Promise<void> {
  const c = await client(cfg);
  await c.updateMetadata(metadata);
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

// ---------------------------------------------------------------------------
// Identity-endpoint verification
//
// The keys shown by `keys list` are the ones registered on-chain. A running
// processor also advertises the keys it is actually serving on its public
// `/identity` HTTP endpoint. These two views can drift (e.g. the daemon runs
// with a different key file than what was registered, or an on-chain key was
// deactivated but the daemon still serves it). The functions below fetch the
// live `/identity` view so the CLI can flag any mismatch.
// ---------------------------------------------------------------------------

/** A single Baby Jubjub key advertised by a processor's `/identity` endpoint. */
export interface IdentityKey {
  keyType: KeyType;
  keyX:    bigint;
  keyY:    bigint;
  keyId:   string; // keccak256(x ++ y) — same id scheme as the on-chain registry
  active:  boolean;
}

export interface ProcessorIdentity {
  chainId:             string;
  chainedProofAddress: string;
  keys:                IdentityKey[];
}

interface RawIdentityEntry {
  signing_public_key?: [string, string];
  he_public_key?:      [string, string];
  active?:             boolean;
}

function parseIdentityEntry(entry: RawIdentityEntry): IdentityKey | null {
  const active = entry.active !== false;
  const pair =
    Array.isArray(entry.signing_public_key)
      ? { keyType: "Signing" as KeyType, coords: entry.signing_public_key }
      : Array.isArray(entry.he_public_key)
        ? { keyType: "HE" as KeyType, coords: entry.he_public_key }
        : null;
  if (!pair) return null;

  try {
    const keyX = BigInt(pair.coords[0]);
    const keyY = BigInt(pair.coords[1]);
    return { keyType: pair.keyType, keyX, keyY, keyId: computeKeyId(keyX, keyY), active };
  } catch {
    return null; // non-numeric coordinates — treat as malformed
  }
}

/**
 * Fetch and parse a processor's public `/identity` endpoint.
 *
 * Best-effort: returns null when the URL is missing, the endpoint is
 * unreachable, or the payload is malformed, so callers can warn rather than
 * fail hard.
 *
 * @param baseUrl Processor base URL (the `/identity` path is appended).
 */
export async function fetchProcessorIdentity(baseUrl: string): Promise<ProcessorIdentity | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/identity`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const body = await res.json() as { result?: {
      chain_id?: unknown;
      chained_proof_address?: unknown;
      public_keys?: RawIdentityEntry[];
    } };
    const result = body?.result;
    if (!result || !Array.isArray(result.public_keys)) return null;

    const keys = result.public_keys
      .map(parseIdentityEntry)
      .filter((k): k is IdentityKey => k !== null);

    return {
      chainId:             String(result.chain_id ?? ""),
      chainedProofAddress: String(result.chained_proof_address ?? ""),
      keys,
    };
  } catch {
    return null;
  }
}

export interface KeysWithExposure {
  /** On-chain keys, filtered by the `includeInactive` flag. */
  keys: KeyRecord[];
  /** Base URL used to reach `/identity`, or null if none is configured. */
  identityUrl: string | null;
  /** Parsed `/identity` response, or null if unreachable/malformed. */
  identity: ProcessorIdentity | null;
  /** keyIds the running processor is actively serving on `/identity`. */
  servedKeyIds: Set<string>;
  /** Keys served on `/identity` that are NOT active in the on-chain registry. */
  unregisteredServedKeys: IdentityKey[];
}

/**
 * Load on-chain keys and cross-check them against the processor's live
 * `/identity` endpoint.
 *
 * The endpoint URL is taken from the on-chain metadata (what clients actually
 * see), falling back to the locally-configured `PROCESSOR_URL`.
 */
export async function getKeysWithExposureCheck(
  cfg: ProcessorConfig,
  includeInactive: boolean,
): Promise<KeysWithExposure> {
  const info = await (await client(cfg)).getOnChainInfo();
  const keys = includeInactive ? info.keys : info.keys.filter((k) => k.isActive);

  const identityUrl = info.metadata.url || cfg.metadata.url || null;
  const identity = identityUrl ? await fetchProcessorIdentity(identityUrl) : null;

  const servedKeyIds = new Set<string>(
    (identity?.keys ?? []).filter((k) => k.active).map((k) => k.keyId),
  );

  const activeOnChainIds = new Set(info.keys.filter((k) => k.isActive).map((k) => k.keyId));
  const unregisteredServedKeys = (identity?.keys ?? []).filter(
    (k) => k.active && !activeOnChainIds.has(k.keyId),
  );

  return { keys, identityUrl, identity, servedKeyIds, unregisteredServedKeys };
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
 * Return stake rows for ETH (processor registry has no token allowlist).
 * Each row shows the active balance and any pending removal.
 */
export async function getStakes(cfg: ProcessorConfig): Promise<StakeRow[]> {
  const c = await client(cfg);
  const tokens = [ZeroAddress];

  return Promise.all(
    tokens.map(async (token) => ({
      token,
      label:   token === ZeroAddress ? "ETH" : token,
      active:  await c.stake.getStake(token),
      pending: await c.stake.getPendingRemoval(token),
    }))
  );
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
