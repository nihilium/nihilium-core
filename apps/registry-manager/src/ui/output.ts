/**
 * Terminal output helpers
 *
 * All formatting is isolated here so the rest of the app stays I/O-free.
 * To upgrade to a dashboard, replace this module with JSON serialisers or
 * React component renderers — the callers remain unchanged.
 */

import chalk from "chalk";
import Table from "cli-table3";
import { formatEther, ZeroAddress } from "ethers";
import type { ProcessorOnChainInfo, KeyRecord } from "@nihilium/registry";
import type { DatastreamOnChainInfo, DatastreamKeyRecord } from "@nihilium/registry";
import type { StakeRow } from "../lib/processor"; // same shape in datastream

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortHex(hex: string, chars = 8): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return hex.slice(0, chars + 2) + "…" + hex.slice(-chars);
}

function formatToken(amount: bigint, token: string): string {
  if (token === ZeroAddress) return `${formatEther(amount)} ETH`;
  return `${amount.toString()} (raw)`;
}

function keyStatus(isActive: boolean, deactivatedAt: bigint): string {
  if (isActive) return chalk.green("active");
  const ts = new Date(Number(deactivatedAt) * 1000).toISOString();
  return chalk.red(`inactive @ ${ts}`);
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export function printProcessorStatus(info: ProcessorOnChainInfo): void {
  const statusBadge = info.isActive ? chalk.bgGreen.black(" ACTIVE ") : chalk.bgRed.white(" INACTIVE ");

  console.log();
  console.log(chalk.bold("Processor") + "  " + statusBadge);
  console.log(chalk.dim("Address:       ") + info.address);
  console.log(chalk.dim("Name:          ") + (info.metadata.name || chalk.dim("—")));
  console.log(chalk.dim("Description:   ") + (info.metadata.description || chalk.dim("—")));
  console.log(chalk.dim("URL:           ") + (info.metadata.url || chalk.dim("—")));
  console.log(chalk.dim("Tor:           ") + (info.metadata.tor || chalk.dim("—")));
  console.log(
    chalk.dim("Grace period:  ") +
      `${info.gracePeriodBlocks} blocks` +
      (info.pendingGracePeriodBlocks > 0n
        ? chalk.yellow(` (pending: ${info.pendingGracePeriodBlocks} from block ${info.pendingGracePeriodRequestedAt})`)
        : "")
  );

  if (info.keys.length === 0) {
    console.log(chalk.dim("\nNo keys registered."));
  } else {
    console.log();
    printKeyTable(info.keys);
  }
}

export function printDatastreamStatus(info: DatastreamOnChainInfo): void {
  const statusBadge = info.isActive ? chalk.bgGreen.black(" ACTIVE ") : chalk.bgRed.white(" INACTIVE ");

  console.log();
  console.log(chalk.bold("Datastream") + "  " + statusBadge);
  console.log(chalk.dim("Address:          ") + info.address);
  console.log(chalk.dim("Contract:         ") + info.contractAddress);
  console.log(chalk.dim("Name:             ") + (info.metadata.name || chalk.dim("—")));
  console.log(chalk.dim("Description:      ") + (info.metadata.description || chalk.dim("—")));
  console.log(chalk.dim("URL:              ") + (info.metadata.url || chalk.dim("—")));
  console.log(chalk.dim("Tor:              ") + (info.metadata.tor || chalk.dim("—")));
  console.log(
    chalk.dim("Grace period:     ") +
      `${info.gracePeriodBlocks} blocks` +
      (info.pendingGracePeriodBlocks > 0n
        ? chalk.yellow(` (pending: ${info.pendingGracePeriodBlocks} from block ${info.pendingGracePeriodRequestedAt})`)
        : "")
  );

  if (info.keys.length === 0) {
    console.log(chalk.dim("\nNo keys registered."));
  } else {
    console.log();
    printDatastreamKeyTable(info.keys);
  }
}

// ---------------------------------------------------------------------------
// Key tables
// ---------------------------------------------------------------------------

export function printKeyTable(keys: KeyRecord[]): void {
  if (keys.length === 0) {
    console.log(chalk.dim("No keys."));
    return;
  }

  const t = new Table({
    head: [
      chalk.cyan("Key ID"),
      chalk.cyan("Type"),
      chalk.cyan("Public Key (x)"),
      chalk.cyan("Status"),
    ],
    style: { head: [], border: [] },
  });

  for (const k of keys) {
    t.push([
      shortHex(k.keyId, 6),
      k.keyType,
      shortHex("0x" + k.keyX.toString(16), 8),
      keyStatus(k.isActive, k.deactivatedAt),
    ]);
  }

  console.log(t.toString());
}

export function printDatastreamKeyTable(keys: DatastreamKeyRecord[]): void {
  if (keys.length === 0) {
    console.log(chalk.dim("No keys."));
    return;
  }

  const t = new Table({
    head: [
      chalk.cyan("Key ID"),
      chalk.cyan("Public Key (x)"),
      chalk.cyan("Status"),
    ],
    style: { head: [], border: [] },
  });

  for (const k of keys) {
    t.push([
      shortHex(k.keyId, 6),
      shortHex("0x" + k.keyX.toString(16), 8),
      keyStatus(k.isActive, k.deactivatedAt),
    ]);
  }

  console.log(t.toString());
}

// ---------------------------------------------------------------------------
// Stake table
// ---------------------------------------------------------------------------

export function printStakeTable(rows: StakeRow[]): void {
  if (rows.length === 0) {
    console.log(chalk.dim("No stake tokens available."));
    return;
  }

  const t = new Table({
    head: [
      chalk.cyan("Token"),
      chalk.cyan("Active Stake"),
      chalk.cyan("Pending Removal"),
      chalk.cyan("Withdrawable at Block"),
    ],
    style: { head: [], border: [] },
  });

  for (const r of rows) {
    const active  = r.active > 0n ? chalk.green(formatToken(r.active, r.token)) : chalk.dim("0");
    const pending = r.pending
      ? chalk.yellow(formatToken(r.pending.amount, r.token))
      : chalk.dim("—");
    const avail = r.pending
      ? String(r.pending.withdrawableAtBlock)
      : chalk.dim("—");

    t.push([r.label, active, pending, avail]);
  }

  console.log(t.toString());
}

// ---------------------------------------------------------------------------
// Spinners / simple progress
// ---------------------------------------------------------------------------

export function printSpinner(msg: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write("\n");
  const id = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i++ % frames.length])}  ${msg}`);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r" + " ".repeat(msg.length + 4) + "\r");
  };
}

export function printSuccess(msg: string): void {
  console.log(chalk.green("✔") + "  " + msg);
}

export function printError(msg: string): void {
  console.error(chalk.red("✖") + "  " + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue("ℹ") + "  " + msg);
}
