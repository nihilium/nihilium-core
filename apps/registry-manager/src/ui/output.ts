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

function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s >= 86400) return `${(s / 86400).toFixed(1)} days`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)} hours`;
  if (s >= 60) return `${Math.round(s / 60)} minutes`;
  return `${s} seconds`;
}

function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toISOString();
}

/** Unix seconds on new contracts; block number on legacy block-based grace. */
function formatWithdrawableAt(value: bigint): string {
  if (value === 0n) return "—";
  if (value > 1_000_000_000n) return formatTimestamp(value);
  return `block ${value.toString()}`;
}

function keyStatus(isActive: boolean, deactivatedAt: bigint): string {
  if (isActive) return chalk.green("active");
  const ts = new Date(Number(deactivatedAt) * 1000).toISOString();
  return chalk.red(`inactive @ ${ts}`);
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export function printProcessorStatus(info: ProcessorOnChainInfo, stakes?: StakeRow[]): void {
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
      formatDuration(info.gracePeriodSeconds) +
      (info.pendingGracePeriodSeconds > 0n
        ? chalk.yellow(
            ` (pending: ${formatDuration(info.pendingGracePeriodSeconds)} from ${formatTimestamp(info.pendingGracePeriodRequestedAt)})`
          )
        : "")
  );

  if (info.keys.length === 0) {
    console.log(chalk.dim("\nNo keys registered."));
  } else {
    console.log();
    printKeyTable(info.keys);
  }

  if (stakes !== undefined) {
    console.log();
    console.log(chalk.bold("Stake"));
    printStakeTable(stakes);
  }
}

export function printDatastreamStatus(info: DatastreamOnChainInfo, stakes?: StakeRow[]): void {
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
      formatDuration(info.gracePeriodSeconds) +
      (info.pendingGracePeriodSeconds > 0n
        ? chalk.yellow(
            ` (pending: ${formatDuration(info.pendingGracePeriodSeconds)} from ${formatTimestamp(info.pendingGracePeriodRequestedAt)})`
          )
        : "")
  );

  if (info.keys.length === 0) {
    console.log(chalk.dim("\nNo keys registered."));
  } else {
    console.log();
    printDatastreamKeyTable(info.keys);
  }

  if (stakes !== undefined) {
    console.log();
    console.log(chalk.bold("Stake"));
    printStakeTable(stakes);
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
      chalk.cyan("Withdrawable at"),
    ],
    style: { head: [], border: [] },
  });

  for (const r of rows) {
    const active  = r.active > 0n ? chalk.green(formatToken(r.active, r.token)) : chalk.dim("0");
    const pending = r.pending
      ? chalk.yellow(formatToken(r.pending.amount, r.token))
      : chalk.dim("—");
    const avail = r.pending
      ? formatWithdrawableAt(r.pending.withdrawableAt)
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

export function printDerivedProcessorKey(data: {
  keyType: "HE" | "Signing";
  x: bigint;
  y: bigint;
  keyId: string;
}): void {
  console.log();
  console.log(chalk.bold("Derived Processor Key"));
  console.log(chalk.dim("Type:   ") + data.keyType);
  console.log(chalk.dim("x (dec): ") + data.x.toString(10));
  console.log(chalk.dim("y (dec): ") + data.y.toString(10));
  console.log(chalk.dim("keyId:  ") + data.keyId);
}

export interface RegistryStakeListRow {
  kind: "Processor" | "Datastream";
  address: string;
  name: string;
  active: boolean;
  gracePeriodSeconds: bigint;
  pendingGracePeriodSeconds: bigint;
  token: string;
  activeStake: bigint;
  pendingRemovalAmount: bigint;
  withdrawableAt: bigint;
}

export function printRegistryStakeList(rows: RegistryStakeListRow[]): void {
  if (rows.length === 0) {
    console.log(chalk.dim("No processors or datastreams found."));
    return;
  }

  const t = new Table({
    head: [
      chalk.cyan("Type"),
      chalk.cyan("Address"),
      chalk.cyan("Name"),
      chalk.cyan("State"),
      chalk.cyan("Grace"),
      chalk.cyan("Pending Grace"),
      chalk.cyan("Token"),
      chalk.cyan("Active Stake"),
      chalk.cyan("Pending Removal"),
      chalk.cyan("Withdrawable @"),
    ],
    style: { head: [], border: [] },
  });

  for (const r of rows) {
    const state = r.active ? chalk.green("active") : chalk.red("inactive");
    const token = r.token === ZeroAddress ? "ETH" : shortHex(r.token, 6);
    const activeStake = formatToken(r.activeStake, r.token);
    const pending = r.pendingRemovalAmount > 0n
      ? formatToken(r.pendingRemovalAmount, r.token)
      : chalk.dim("—");
    const withdrawable = formatWithdrawableAt(r.withdrawableAt);

    t.push([
      r.kind,
      shortHex(r.address, 8),
      r.name || chalk.dim("—"),
      state,
      formatDuration(r.gracePeriodSeconds),
      r.pendingGracePeriodSeconds > 0n ? formatDuration(r.pendingGracePeriodSeconds) : chalk.dim("—"),
      token,
      activeStake,
      pending,
      withdrawable,
    ]);
  }

  console.log(t.toString());
}
