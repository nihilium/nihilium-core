/**
 * Configuration helpers
 *
 * Reads environment variables (already loaded by the entry point via dotenv)
 * and returns strongly-typed config objects for ProcessorClient and
 * DatastreamClient.
 *
 * Every field that is needed for a specific operation has a dedicated getter
 * so callers can import only the slice they need, and future dashboard code
 * can supply config from a different source (database, request body, etc.)
 * by swapping this module out.
 */

import dotenv from "dotenv";
dotenv.config();

import type { ProcessorConfig } from "@nihilium/registry";
import type { DatastreamConfig } from "@nihilium/registry";
import { registryContracts } from "@nihilium/registry";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function splitKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

export function getRpcUrl(): string {
  return requireEnv("RPC_URL");
}

export function getNihiliumApiUrl(): string {
  return opt("NIHILIUM_API_URL", "https://nihilium.io");
}

export function getNihiliumPortalUrl(): string {
  return opt("NIHILIUM_PORTAL_URL", "https://nihilium.io");
}

export function getChainId(): number {
  return parseInt(opt("CHAIN_ID", "43113"), 10);
}

// ---------------------------------------------------------------------------
// Processor config
// ---------------------------------------------------------------------------

export function getProcessorConfig(): ProcessorConfig {
  const chainId = getChainId();

  // Allow overriding the registry address; fall back to the built-in lookup table.
  const contractAddress =
    process.env.PROCESSOR_REGISTRY_ADDRESS ??
    registryContracts[chainId]?.processorRegistry;

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `No ProcessorRegistry address for chain ${chainId}. ` +
        `Set PROCESSOR_REGISTRY_ADDRESS in your .env`
    );
  }

  return {
    ethPrivateKey:      requireEnv("PROCESSOR_PRIVATE_KEY"),
    hePrivateKeys:      splitKeys(opt("PROCESSOR_HE_PRIVATE_KEYS")),
    signingPrivateKeys: splitKeys(opt("PROCESSOR_SIGNING_PRIVATE_KEYS")),
    rpcEndpoint:        getRpcUrl(),
    contractAddress,
    gracePeriodSeconds: parseInt(opt("PROCESSOR_GRACE_PERIOD_SECONDS", "86400"), 10),
    metadata: {
      name:        opt("PROCESSOR_NAME", "Unnamed Processor"),
      description: opt("PROCESSOR_DESCRIPTION"),
      url:         opt("PROCESSOR_URL"),
      tor:         opt("PROCESSOR_TOR"),
    },
  };
}

// ---------------------------------------------------------------------------
// Datastream config
// ---------------------------------------------------------------------------

export function getDatastreamConfig(): DatastreamConfig {
  const chainId = getChainId();

  const contractAddress =
    process.env.DATASTREAM_REGISTRY_ADDRESS ??
    registryContracts[chainId]?.datastreamRegistry;

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `No DatastreamRegistry address for chain ${chainId}. ` +
        `Set DATASTREAM_REGISTRY_ADDRESS in your .env`
    );
  }

  return {
    ethPrivateKey:      requireEnv("DATASTREAM_PRIVATE_KEY"),
    signingPrivateKeys: splitKeys(opt("DATASTREAM_SIGNING_PRIVATE_KEYS")),
    rpcEndpoint:        getRpcUrl(),
    contractAddress,
    datastreamContract: requireEnv("DATASTREAM_CONTRACT_ADDRESS"),
    gracePeriodSeconds: parseInt(opt("DATASTREAM_GRACE_PERIOD_SECONDS", "43200"), 10),
    metadata: {
      name:        opt("DATASTREAM_NAME", "Unnamed Datastream"),
      description: opt("DATASTREAM_DESCRIPTION"),
      url:         opt("DATASTREAM_URL"),
      tor:         opt("DATASTREAM_TOR"),
    },
  };
}
