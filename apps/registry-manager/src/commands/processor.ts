/**
 * Processor registry subcommands
 *
 * Yargs module exported as { command, describe, builder, handler }.
 * All business logic is delegated to src/lib/processor.ts; all terminal
 * output goes through src/ui/.
 *
 * Commands:
 *   processor status
 *   processor register
 *   processor metadata update
 *   processor keys list
 *   processor keys deactivate <keyId>
 *   processor stake list
 *   processor stake add <token> <amount>
 *   processor stake signal <token> <amount>
 *   processor stake finalize <token>
 */

import type { Argv } from "yargs";
import { parseEther, ZeroAddress } from "ethers";
import { getProcessorConfig } from "../config";
import * as lib from "../lib/processor";
import {
  printProcessorStatus,
  printKeyTable,
  printDerivedProcessorKey,
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
// Top-level module export consumed by yargs .command(require(...))
// ---------------------------------------------------------------------------

export const command  = "processor <action>";
export const describe = "Manage your processor registry entry";

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
// processor status
// ---------------------------------------------------------------------------

const statusCmd = {
  command:  "status",
  describe: "Show registration status, metadata, keys, and stake",
  handler:  async () => {
    const cfg = getProcessorConfig();
    const stop = printSpinner("Fetching on-chain state…");
    try {
      const [info, stakes] = await Promise.all([
        lib.getProcessorStatus(cfg),
        lib.getStakes(cfg),
      ]);
      stop();
      printProcessorStatus(info, stakes);
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

// ---------------------------------------------------------------------------
// processor register
// ---------------------------------------------------------------------------

const registerCmd = {
  command:  "register",
  describe: "Register this processor and upload all configured keys (idempotent)",
  handler:  async () => {
    const cfg = getProcessorConfig();
    const stop = printSpinner("Registering processor…");
    try {
      await lib.registerProcessor(cfg);
      stop();
      printSuccess("Processor registered and all keys uploaded.");
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

// ---------------------------------------------------------------------------
// processor metadata
// ---------------------------------------------------------------------------

const metadataUpdateCmd = {
  command:  "update",
  describe: "Update on-chain metadata from configured env vars",
  handler:  async () => {
    const cfg = getProcessorConfig();

    const ok = await confirmMetadataUpdate(cfg.metadata);
    if (!ok) { printInfo("Aborted."); return; }

    const stop = printSpinner("Updating metadata…");
    try {
      await lib.updateProcessorMetadata(cfg, cfg.metadata);
      stop();
      printSuccess("Processor metadata updated.");
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
// processor keys
// ---------------------------------------------------------------------------

const keysListCmd = {
  command:  "list",
  describe: "List all registered keys",
  builder:  (y: Argv) =>
    y.option("all", {
      alias:   "a",
      type:    "boolean",
      default: false,
      describe: "Show inactive keys too",
    }),
  handler: async (argv: { all: boolean }) => {
    const cfg = getProcessorConfig();
    const stop = printSpinner("Loading keys…");
    try {
      const keys = argv.all ? await lib.getAllKeys(cfg) : await lib.getActiveKeys(cfg);
      stop();
      if (keys.length === 0) {
        printInfo(argv.all ? "No keys registered." : "No active keys found.");
      } else {
        printKeyTable(keys);
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
  describe: "Deactivate a registered key",
  builder:  (y: Argv) =>
    y.positional("keyId", { type: "string", describe: "bytes32 key ID (0x…)" }),
  handler: async (argv: { keyId: string | undefined }) => {
    const keyId = argv.keyId!;
    const cfg = getProcessorConfig();
    const ok = await confirmDeactivateKey(keyId);
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

const keysDeriveCmd = {
  command:  "derive",
  describe: "Derive public key coordinates and keyIds from configured env private keys",
  handler: async () => {
    const cfg = getProcessorConfig();
    const stop = printSpinner("Deriving public key…");
    try {
      const derivedKeys = await lib.deriveConfiguredProcessorPublicKeys(cfg);
      stop();
      if (derivedKeys.length === 0) {
        printInfo("No processor keys found in env. Set PROCESSOR_HE_PRIVATE_KEYS and/or PROCESSOR_SIGNING_PRIVATE_KEYS.");
        return;
      }
      for (const d of derivedKeys) {
        printDerivedProcessorKey({ keyType: d.keyType, x: d.x, y: d.y, keyId: d.keyId });
      }
    } catch (e) {
      stop();
      printError(String(e));
      process.exit(1);
    }
  },
};

const keysCmd = {
  command:  "keys <action>",
  describe: "Manage registered keys",
  builder:  (y: Argv) =>
    y
      .command(keysListCmd)
      .command(keysDeactivateCmd)
      .command(keysDeriveCmd)
      .demandCommand(1, "Specify an action: list | deactivate | derive")
      .strict(),
  handler: () => undefined,
};

// ---------------------------------------------------------------------------
// processor stake
// ---------------------------------------------------------------------------

const stakeListCmd = {
  command:  "list",
  describe: "List stake for ETH and all allowed tokens",
  handler:  async () => {
    const cfg = getProcessorConfig();
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
  describe: "Deposit stake.  token defaults to ETH (0x000…)",
  builder:  (y: Argv) =>
    y
      .positional("token", {
        type:     "string",
        default:  ZeroAddress,
        describe: "ERC-20 address or omit / 0x000… for ETH",
      })
      .positional("amount", {
        type:     "string",
        describe: 'Amount: use ether units for ETH (e.g. "1.5") or raw units for ERC-20',
      }),
  handler: async (argv: { token: string | undefined; amount: string | undefined }) => {
    const cfg   = getProcessorConfig();
    const token = argv.token ?? ZeroAddress;
    const raw   = argv.amount!;
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
        type:     "string",
        default:  ZeroAddress,
        describe: "ERC-20 address or omit for ETH",
      })
      .positional("amount", { type: "string", describe: "Amount to remove" }),
  handler: async (argv: { token: string | undefined; amount: string | undefined }) => {
    const cfg   = getProcessorConfig();
    const token = argv.token ?? ZeroAddress;
    const raw   = argv.amount!;
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
      type:     "string",
      default:  ZeroAddress,
      describe: "ERC-20 address or omit for ETH",
    }),
  handler: async (argv: { token: string }) => {
    const cfg   = getProcessorConfig();
    const token = argv.token ?? ZeroAddress;

    // Fetch the pending amount for the confirmation message
    let amount = 0n;
    try {
      const rows = await lib.getStakes(cfg);
      amount = rows.find((r) => r.token.toLowerCase() === token.toLowerCase())?.pending?.amount ?? 0n;
    } catch { /* continue even if lookup fails */ }

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
