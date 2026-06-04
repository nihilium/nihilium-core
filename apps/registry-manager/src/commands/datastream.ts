/**
 * Datastream registry subcommands
 *
 * Commands:
 *   datastream status
 *   datastream register
 *   datastream metadata update
 *   datastream keys list
 *   datastream keys deactivate <keyId>
 *   datastream stake list
 *   datastream stake add [token] <amount>
 *   datastream stake signal [token] <amount>
 *   datastream stake finalize [token]
 */

import type { Argv } from "yargs";
import { parseEther, ZeroAddress } from "ethers";
import { getDatastreamConfig } from "../config";
import * as lib from "../lib/datastream";
import {
  printDatastreamStatus,
  printDatastreamKeyTable,
  printStakeTable,
  printSpinner,
  printSuccess,
  printError,
  printInfo,
} from "../ui/output";
import {
  confirmStakeAdd,
  confirmStakeSignal,
  confirmStakeFinalize,
  confirmDeactivateKey,
  confirmMetadataUpdate,
} from "../ui/confirm";

// ---------------------------------------------------------------------------
// Top-level module export
// ---------------------------------------------------------------------------

export const command  = "datastream <action>";
export const describe = "Manage your datastream registry entry";

export function builder(yargs: Argv): Argv {
  return yargs
    .command(statusCmd)
    .command(registerCmd)
    .command(metadataCmd)
    .command(keysCmd)
    .command(stakeCmd)
    .demandCommand(1, "Specify an action: status | register | metadata | keys | stake")
    .strict();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(_argv: unknown): Promise<void> {
  // handled by subcommands
}

// ---------------------------------------------------------------------------
// datastream status
// ---------------------------------------------------------------------------

const statusCmd = {
  command:  "status",
  describe: "Show registration status, metadata, keys, and stake",
  handler:  async () => {
    const cfg = getDatastreamConfig();
    const stop = printSpinner("Fetching on-chain state…");
    try {
      const [info, stakes] = await Promise.all([
        lib.getDatastreamStatus(cfg),
        lib.getStakes(cfg),
      ]);
      stop();
      printDatastreamStatus(info, stakes);
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

// ---------------------------------------------------------------------------
// datastream register
// ---------------------------------------------------------------------------

const registerCmd = {
  command:  "register",
  describe: "Register this datastream operator and upload all configured keys (idempotent)",
  handler:  async () => {
    const cfg = getDatastreamConfig();
    const stop = printSpinner("Registering datastream…");
    try {
      await lib.registerDatastream(cfg);
      stop();
      printSuccess("Datastream registered and all keys uploaded.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

// ---------------------------------------------------------------------------
// datastream metadata
// ---------------------------------------------------------------------------

const metadataUpdateCmd = {
  command:  "update",
  describe: "Update on-chain metadata from configured env vars",
  handler:  async () => {
    const cfg = getDatastreamConfig();

    const ok = await confirmMetadataUpdate(cfg.metadata);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Updating metadata…");
    try {
      await lib.updateDatastreamMetadata(cfg, cfg.metadata);
      stop();
      printSuccess("Datastream metadata updated.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const metadataCmd = {
  command:  "metadata <action>",
  describe: "Update registry metadata",
  builder:  (y: Argv) =>
    y
      .command(metadataUpdateCmd)
      .demandCommand(1, "Specify an action: update")
      .strict(),
  handler: () => undefined,
};

// ---------------------------------------------------------------------------
// datastream keys
// ---------------------------------------------------------------------------

const keysListCmd = {
  command:  "list",
  describe: "List all registered signing keys",
  builder:  (y: Argv) =>
    y.option("all", {
      alias:    "a",
      type:     "boolean",
      default:  false,
      describe: "Show inactive keys too",
    }),
  handler: async (argv: { all: boolean }) => {
    const cfg = getDatastreamConfig();
    const stop = printSpinner("Loading keys…");
    try {
      const keys = argv.all ? await lib.getAllKeys(cfg) : await lib.getActiveKeys(cfg);
      stop();
      if (keys.length === 0) {
        printInfo(argv.all ? "No keys registered." : "No active keys found.");
      } else {
        printDatastreamKeyTable(keys);
      }
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const keysDeactivateCmd = {
  command:  "deactivate <keyId>",
  describe: "Deactivate a registered signing key",
  builder:  (y: Argv) =>
    y.positional("keyId", { type: "string", describe: "bytes32 key ID (0x…)" }),
  handler: async (argv: { keyId: string | undefined }) => {
    const keyId = argv.keyId!;
    const cfg = getDatastreamConfig();
    const ok  = await confirmDeactivateKey(keyId);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Deactivating key…");
    try {
      await lib.deactivateKey(cfg, keyId);
      stop();
      printSuccess(`Key ${keyId} deactivated.`);
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const keysCmd = {
  command:  "keys <action>",
  describe: "Manage registered signing keys",
  builder:  (y: Argv) =>
    y
      .command(keysListCmd)
      .command(keysDeactivateCmd)
      .demandCommand(1, "Specify an action: list | deactivate")
      .strict(),
  handler: () => undefined,
};

// ---------------------------------------------------------------------------
// datastream stake
// ---------------------------------------------------------------------------

const stakeListCmd = {
  command:  "list",
  describe: "List stake for ETH and all allowed tokens",
  handler:  async () => {
    const cfg  = getDatastreamConfig();
    const stop = printSpinner("Loading stake…");
    try {
      const rows = await lib.getStakes(cfg);
      stop();
      printStakeTable(rows);
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const stakeAddCmd = {
  command:  "add [token] <amount>",
  describe: "Deposit stake.  token defaults to ETH",
  builder:  (y: Argv) =>
    y
      .positional("token", {
        type:     "string",
        default:  ZeroAddress,
        describe: "ERC-20 address or omit for ETH",
      })
      .positional("amount", {
        type:     "string",
        describe: 'Amount: ether units for ETH (e.g. "1.5") or raw units for ERC-20',
      }),
  handler: async (argv: { token: string | undefined; amount: string | undefined }) => {
    const cfg   = getDatastreamConfig();
    const token  = argv.token ?? ZeroAddress;
    const raw    = argv.amount!;
    const amount =
      token === ZeroAddress ? parseEther(raw) : BigInt(raw);

    const ok = await confirmStakeAdd(token, amount);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Submitting transaction…");
    try {
      await lib.addStake(cfg, token, amount);
      stop();
      printSuccess("Stake deposited.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const stakeSignalCmd = {
  command:  "signal [token] <amount>",
  describe: "Signal intent to remove stake (starts grace period)",
  builder:  (y: Argv) =>
    y
      .positional("token", {
        type:    "string",
        default: ZeroAddress,
        describe: "ERC-20 address or omit for ETH",
      })
      .positional("amount", { type: "string", describe: "Amount to remove" }),
  handler: async (argv: { token: string | undefined; amount: string | undefined }) => {
    const cfg   = getDatastreamConfig();
    const token  = argv.token ?? ZeroAddress;
    const raw    = argv.amount!;
    const amount =
      token === ZeroAddress ? parseEther(raw) : BigInt(raw);

    const ok = await confirmStakeSignal(token, amount);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Submitting transaction…");
    try {
      await lib.signalStakeRemoval(cfg, token, amount);
      stop();
      printSuccess("Stake removal signalled. Wait for grace period, then run `stake finalize`.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const stakeFinalizeCmd = {
  command:  "finalize [token]",
  describe: "Withdraw a pending stake removal after the grace period",
  builder:  (y: Argv) =>
    y.positional("token", {
      type:    "string",
      default: ZeroAddress,
      describe: "ERC-20 address or omit for ETH",
    }),
  handler: async (argv: { token: string }) => {
    const cfg   = getDatastreamConfig();
    const token  = argv.token ?? ZeroAddress;

    let amount = 0n;
    try {
      const rows = await lib.getStakes(cfg);
      amount = rows.find((r) => r.token.toLowerCase() === token.toLowerCase())?.pending?.amount ?? 0n;
    } catch { /* continue */ }

    const ok = await confirmStakeFinalize(token, amount);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Submitting transaction…");
    try {
      await lib.finalizeStakeRemoval(cfg, token);
      stop();
      printSuccess("Stake withdrawn.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const stakeCmd = {
  command:  "stake <action>",
  describe: "Manage staked tokens",
  builder:  (y: Argv) =>
    y
      .command(stakeListCmd)
      .command(stakeAddCmd)
      .command(stakeSignalCmd)
      .command(stakeFinalizeCmd)
      .demandCommand(1, "Specify an action: list | add | signal | finalize")
      .strict(),
  handler: () => undefined,
};
