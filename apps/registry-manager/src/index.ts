#!/usr/bin/env node
/**
 * registry-manager
 *
 * CLI for managing Nihilium processor and datastream registry entries.
 *
 * Usage:
 *   registry-manager processor status
 *   registry-manager processor register
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
 *   registry-manager datastream keys list [--all]
 *   registry-manager datastream keys deactivate <keyId>
 *   registry-manager datastream stake list
 *   registry-manager datastream stake add [token] <amount>
 *   registry-manager datastream stake signal [token] <amount>
 *   registry-manager datastream stake finalize [token]
 *
 *   registry-manager list [--all]
 *
 * Configuration is read from a .env file in the current working directory.
 * See .env.example for all supported variables.
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Command modules are imported after dotenv so process.env is populated.
import * as processorCommand  from "./commands/processor";
import * as datastreamCommand from "./commands/datastream";
import * as listCommand from "./commands/list";

yargs(hideBin(process.argv))
  .scriptName("registry-manager")
  .usage("$0 <command> [options]")
  .command(processorCommand)
  .command(datastreamCommand)
  .command(listCommand)
  .demandCommand(1, "Specify a command: processor | datastream | list")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .wrap(Math.min(120, (process.stdout.columns ?? 80)))
  .parse();
