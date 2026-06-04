/**
 * Interactive prompts
 *
 * Isolated here so that a future dashboard can skip confirmations entirely
 * (headless mode) or replace them with modal dialogs.
 */

import inquirer from "inquirer";
import { formatEther, ZeroAddress } from "ethers";
import chalk from "chalk";

function humanAmount(amount: bigint, token: string): string {
  if (token === ZeroAddress) return `${formatEther(amount)} ETH`;
  return `${amount.toString()} tokens (${token})`;
}

/**
 * Ask the user to confirm depositing stake.
 * Returns false if the user declines, allowing the caller to abort cleanly.
 */
export async function confirmStakeAdd(token: string, amount: bigint): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message:
        `Deposit ${chalk.yellow(humanAmount(amount, token))} as stake?`,
      default: false,
    },
  ]);
  return ok;
}

/**
 * Ask the user to confirm signalling a stake removal (starts grace period).
 */
export async function confirmStakeSignal(token: string, amount: bigint): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message:
        `Signal removal of ${chalk.yellow(humanAmount(amount, token))}? ` +
        chalk.dim("(Grace period starts immediately.)"),
      default: false,
    },
  ]);
  return ok;
}

/**
 * Ask the user to confirm finalising a pending stake removal (funds withdrawn).
 */
export async function confirmStakeFinalize(token: string, amount: bigint): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message:
        `Withdraw ${chalk.yellow(humanAmount(amount, token))} from the contract?`,
      default: false,
    },
  ]);
  return ok;
}

/**
 * Ask the user to confirm deactivating a key.
 */
export async function confirmMetadataUpdate(fields: {
  name: string;
  description: string;
  url: string;
  tor: string;
}): Promise<boolean> {
  const lines = [
    fields.name && `name: ${fields.name}`,
    fields.description && `description: ${fields.description}`,
    fields.url && `url: ${fields.url}`,
    fields.tor && `tor: ${fields.tor}`,
  ].filter(Boolean);

  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message:
        `Update on-chain metadata?\n` +
        chalk.dim(lines.join("\n") || "(all fields empty)"),
      default: false,
    },
  ]);
  return ok;
}

export async function confirmDeactivateKey(keyId: string): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message:
        `Deactivate key ${chalk.yellow(keyId)}? ` +
        chalk.dim("(This cannot be undone.)"),
      default: false,
    },
  ]);
  return ok;
}
