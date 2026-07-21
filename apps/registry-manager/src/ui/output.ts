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
import type { StakeRow, KeysWithExposure } from "../lib/processor"; // same shape in datastream

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

export function printProcessorStatus(info: ProcessorOnChainInfo, stakes?: StakeRow[], claimed?: boolean | null): void {
  const statusBadge = info.isActive ? chalk.bgGreen.black(" ACTIVE ") : chalk.bgRed.white(" INACTIVE ");
  const claimedBadge =
    claimed === true  ? chalk.green("✔ claimed") :
    claimed === false ? chalk.yellow("✖ not claimed") :
                        chalk.dim("unknown");

  console.log();
  console.log(chalk.bold("Processor") + "  " + statusBadge);
  console.log(chalk.dim("Address:       ") + info.address);
  console.log(chalk.dim("Portal claim:  ") + claimedBadge);
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

/**
 * Render the on-chain key table.
 *
 * When `servedKeyIds` is supplied (the set of keyIds the running processor
 * advertises on its `/identity` endpoint) an extra "Served" column is added
 * showing whether each on-chain key is actually being served. Omit it to skip
 * the column (e.g. when the endpoint could not be reached).
 */
export function printKeyTable(keys: KeyRecord[], servedKeyIds?: Set<string>): void {
  if (keys.length === 0) {
    console.log(chalk.dim("No keys."));
    return;
  }

  const withServed = servedKeyIds !== undefined;

  const t = new Table({
    head: [
      chalk.cyan("Key ID"),
      chalk.cyan("Type"),
      chalk.cyan("Public Key (x)"),
      chalk.cyan("Status"),
      ...(withServed ? [chalk.cyan("Served")] : []),
    ],
    style: { head: [], border: [] },
  });

  for (const k of keys) {
    const row = [
      shortHex(k.keyId, 6),
      k.keyType,
      shortHex("0x" + k.keyX.toString(16), 8),
      keyStatus(k.isActive, k.deactivatedAt),
    ];
    if (withServed) {
      row.push(
        !k.isActive
          ? chalk.dim("—") // inactive keys are not expected to be served
          : servedKeyIds!.has(k.keyId) ? chalk.green("✔") : chalk.red("✖"),
      );
    }
    t.push(row);
  }

  console.log(t.toString());
}

/**
 * Print the outcome of cross-checking on-chain keys against the processor's
 * live `/identity` endpoint. Called after `printKeyTable` in `keys list`.
 */
export function printKeyExposureCheck(report: KeysWithExposure): void {
  console.log();

  if (report.identityUrl === null) {
    printInfo(
      "No processor URL set on-chain or in PROCESSOR_URL — skipped /identity verification.",
    );
    return;
  }

  const endpoint = `${report.identityUrl.replace(/\/$/, "")}/identity`;

  if (report.identity === null) {
    printError(`Could not reach ${endpoint} — skipped key verification.`);
    return;
  }

  const activeOnChain = report.keys.filter((k) => k.isActive);
  const notServed = activeOnChain.filter((k) => !report.servedKeyIds.has(k.keyId));
  const unregistered = report.unregisteredServedKeys;

  if (notServed.length === 0 && unregistered.length === 0) {
    printSuccess(`All active on-chain keys match the keys served at ${endpoint}.`);
    return;
  }

  console.log(chalk.yellow.bold(`⚠  Key mismatch against ${endpoint}`));

  for (const k of notServed) {
    console.log(
      chalk.yellow("  • Registered on-chain but NOT served: ") +
        `${shortHex(k.keyId, 6)} (${k.keyType})`,
    );
  }
  for (const k of unregistered) {
    console.log(
      chalk.yellow("  • Served by /identity but NOT active on-chain: ") +
        `${shortHex(k.keyId, 6)} (${k.keyType})`,
    );
  }
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

/** JSON.stringify that survives bigint values and circular refs. */
function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

/** Surface the non-standard fields ethers/JSON-RPC errors attach (code, reason, …). */
function pickErrorFields(err: Error): string[] {
  const fields = ["code", "shortMessage", "reason", "info", "data", "transaction", "receipt"];
  const rec = err as unknown as Record<string, unknown>;
  const parts: string[] = [];
  for (const f of fields) {
    if (rec[f] !== undefined) {
      const v = rec[f];
      parts.push(`${f}=${typeof v === "object" ? safeJson(v) : String(v)}`);
    }
  }
  return parts;
}

/**
 * Render an error with its full stack trace and the entire `cause` chain,
 * plus any ethers-specific fields. Use this instead of `printError(String(e))`
 * so failures show *where* they happened, not just the top-level message.
 */
export function printException(e: unknown, context?: string): void {
  const prefix = context ? `${context}: ` : "";

  if (!(e instanceof Error)) {
    printError(prefix + safeJson(e));
    return;
  }

  const short =
    (e as unknown as { shortMessage?: string }).shortMessage ?? e.message;
  printError(prefix + short);

  const lines: string[] = [];
  let current: unknown = e;
  let level = 0;
  while (current instanceof Error) {
    const indent = "  ".repeat(level);
    const label = level === 0 ? "" : `${indent}caused by: `;
    lines.push(label + (current.stack ?? `${current.name}: ${current.message}`));
    for (const field of pickErrorFields(current)) {
      lines.push(`${indent}  ${field}`);
    }
    current = (current as { cause?: unknown }).cause;
    level++;
    if (level > 12) {
      lines.push(`${indent}… (cause chain truncated)`);
      break;
    }
  }
  if (current !== undefined && !(current instanceof Error)) {
    lines.push(`${"  ".repeat(level)}caused by: ${safeJson(current)}`);
  }

  console.error(chalk.dim(lines.join("\n")));
}

export function printInfo(msg: string): void {
  console.log(chalk.blue("ℹ") + "  " + msg);
}

export function printClaimWarning(address: string, portalUrl: string): void {
  const border = chalk.yellow("─".repeat(60));
  console.log();
  console.log(border);
  console.log(chalk.yellow.bold("  ⚠  Processor not yet claimed"));
  console.log(chalk.dim("  Address: ") + address);
  console.log();
  console.log("  This processor has not been claimed in the Nihilium");
  console.log("  portal. Visit the link below to register and claim it:");
  console.log();
  console.log("  " + chalk.cyan.underline(`${portalUrl}/processors/claim?address=${address}`));
  console.log(border);
  console.log();
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

/**
 * Render freshly generated HE keys.
 *
 * Only public material is printed. The private keys left this process through
 * the clipboard (or a 0600 file) precisely so they stay out of terminal
 * scrollback and shell logs — do not add them to this output.
 */
export function printGeneratedHEKeys(
  keys: Array<{ x: bigint; y: bigint; keyId: string }>,
  destination: { kind: "clipboard"; method: string; confirmed: boolean } | { kind: "file"; path: string },
): void {
  console.log();
  console.log(chalk.bold(`Generated ${keys.length} HE key${keys.length === 1 ? "" : "s"}`));

  keys.forEach((k, i) => {
    console.log();
    if (keys.length > 1) console.log(chalk.dim(`Key ${i + 1}`));
    console.log(chalk.dim("x (dec): ") + k.x.toString(10));
    console.log(chalk.dim("y (dec): ") + k.y.toString(10));
    console.log(chalk.dim("keyId:   ") + k.keyId);
  });

  const plural = keys.length === 1 ? "" : "s";
  const subject = keys.length === 1 ? "The private key was" : "The private keys were";

  console.log();
  if (destination.kind === "file") {
    printSuccess(`Private key${plural} written to ${destination.path} (mode 0600).`);
    console.log();
    console.log(chalk.yellow(`⚠  ${subject} not printed and exist${keys.length === 1 ? "s" : ""} only in that file.`));
    console.log(chalk.dim("   Move the PROCESSOR_HE_PRIVATE_KEYS line into your .env, delete the file, then run:"));
    console.log(chalk.dim("     registry-manager processor register"));
    return;
  }

  if (destination.confirmed) {
    printSuccess(`Private key${plural} copied to the clipboard via ${destination.method}.`);
  } else {
    printInfo(
      `Private key${plural} sent to the clipboard via ${destination.method} — ` +
        `verify the paste worked, as not every terminal honours it.`,
    );
  }

  console.log();
  console.log(chalk.yellow(`⚠  ${subject} not printed and ${keys.length === 1 ? "is" : "are"} not stored anywhere else.`));
  console.log(chalk.dim("   Paste it now into PROCESSOR_HE_PRIVATE_KEYS in your .env"));
  console.log(chalk.dim("   (comma-separate to keep existing keys), then run:"));
  console.log(chalk.dim("     registry-manager processor register"));
  console.log(chalk.dim("   Clear your clipboard afterwards — it is readable by other apps."));
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
