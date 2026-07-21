#!/usr/bin/env node
/**
 * registry-manager
 *
 * CLI for managing Nihilium processor and datastream registry entries.
 *
 * Usage:
 *   registry-manager processor status
 *   registry-manager processor register
 *   registry-manager processor metadata update
 *   registry-manager processor keys list [--all]
 *   registry-manager processor keys deactivate <keyId>
 *   registry-manager processor keys derive
 *   registry-manager processor stake list
 *   registry-manager processor stake add [token] <amount>
 *   registry-manager processor stake signal [token] <amount>
 *   registry-manager processor stake finalize [token]
 *
 *   registry-manager datastream status
 *   registry-manager datastream register
 *   registry-manager datastream metadata update
 *   registry-manager datastream keys list [--all]
 *   registry-manager datastream keys deactivate <keyId>
 *   registry-manager datastream stake list
 *   registry-manager datastream stake add [token] <amount>
 *   registry-manager datastream stake signal [token] <amount>
 *   registry-manager datastream stake finalize [token]
 *
 *   registry-manager list [--all]
 *
 *   registry-manager init [--output <path>] [--force]
 *
 * Configuration is read from a .env file in the current working directory.
 * Run `registry-manager init` to generate an example file, or see .env.example
 * for all supported variables.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { printError, printException } from "./ui/output";

// Command modules are imported after dotenv so process.env is populated.
import * as processorCommand  from "./commands/processor";
import * as datastreamCommand from "./commands/datastream";
import * as listCommand from "./commands/list";
import * as initCommand from "./commands/init";

// Last-resort safety net: any error that escapes a command handler (e.g. thrown
// during config loading, wallet construction, or a network call that runs
// before/around the handler's own try/catch) lands here with a full trace
// instead of Node's terse default output.
process.on("unhandledRejection", (reason) => {
  printException(reason, "Unhandled rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  printException(err, "Uncaught exception");
  process.exit(1);
});

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName("registry-manager")
    .usage("$0 <command> [options]")
    .command(processorCommand)
    .command(datastreamCommand)
    .command(listCommand)
    .command(initCommand)
    .demandCommand(1, "Specify a command: processor | datastream | list | init")
    .strict()
    .help()
    .alias("h", "help")
    .version(false)
    .wrap(Math.min(120, (process.stdout.columns ?? 80)))
    // yargs invokes this for usage/validation errors (`msg`) and for errors
    // thrown while parsing or inside a command handler (`err`).
    .fail((msg, err, y) => {
      if (err) {
        printException(err, "Command failed");
      } else {
        y.showHelp("error");
        console.error();
        printError(msg);
      }
      process.exit(1);
    })
    .parseAsync();
}

main().catch((err) => {
  printException(err, "Command failed");
  process.exit(1);
});
