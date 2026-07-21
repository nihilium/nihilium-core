import type { Argv } from "yargs";
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { generateHEKey, generateSigningPrivateKey } from "../lib/keygen";
import { printError, printException, printInfo, printSuccess } from "../ui/output";

// Warning attached to every auto-generated key so it is obvious the value must
// be replaced before any real (non-local) use.
const AUTOGEN_WARNING =
  "# ⚠  AUTO-GENERATED for convenience — CHANGE THIS before production use.\n" +
  "# Anyone with this key controls the associated identity/keys.";

/**
 * Build the example environment file.
 *
 * Kept inline (rather than copied from the shipped .env.example) so the command
 * works no matter where the CLI is installed or run from. Uses the unified
 * variable names shared with the processor and datastream-server apps.
 *
 * The Baby Jubjub keys (HE + EdDSA signing) are freshly generated on each run so
 * the file is usable out of the box; every generated value carries a warning
 * comment that it must be replaced for anything beyond local testing.
 */
function buildEnvTemplate(): string {
  const heKey = generateHEKey().privateKey;
  const processorSigningKey = generateSigningPrivateKey();
  const datastreamSigningKey = generateSigningPrivateKey();

  return `# =============================================================================
# Network
# =============================================================================
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113

# =============================================================================
# Nihilium portal (optional)
# =============================================================================

# Base URL of the Nihilium API used to check processor claim status.
# Defaults to https://nihilium.io if not set.
#NIHILIUM_API_URL=https://nihilium.io

# Base URL shown in the registration instructions when a processor is unclaimed.
# Defaults to https://nihilium.io if not set.
#NIHILIUM_PORTAL_URL=https://nihilium.io

# =============================================================================
# Processor
# =============================================================================

# Ethereum private key used to sign transactions for the processor account
PROCESSOR_PRIVATE_KEY=0x...

# Baby Jubjub private key(s) for Homomorphic Encryption (ECElGamal).
# Comma-separated if you have more than one, e.g. 0xaaa...,0xbbb...
${AUTOGEN_WARNING}
PROCESSOR_HE_PRIVATE_KEYS=${heKey}

# Baby Jubjub private key(s) for EdDSA signing.
# Comma-separated for multiple.
${AUTOGEN_WARNING}
PROCESSOR_SIGNING_PRIVATE_KEYS=${processorSigningKey}

# Deployed ProcessorRegistry contract address
PROCESSOR_REGISTRY_ADDRESS=0x...

# Human-readable metadata shown in the registry
PROCESSOR_NAME=My Processor
PROCESSOR_DESCRIPTION=A Nihilium processor node
PROCESSOR_URL=https://processor1.nihilium.io
PROCESSOR_TOR=

# Minimum seconds between signalling stake removal and withdrawing.
# Only used during the initial register() call.
PROCESSOR_GRACE_PERIOD_SECONDS=86400

# =============================================================================
# Datastream
# =============================================================================

# Ethereum private key used to sign transactions for the datastream account
DATASTREAM_PRIVATE_KEY=0x...

# Baby Jubjub private key(s) for EdDSA signing.
# Comma-separated for multiple.
${AUTOGEN_WARNING}
DATASTREAM_SIGNING_PRIVATE_KEYS=${datastreamSigningKey}

# Deployed DatastreamRegistry contract address
DATASTREAM_REGISTRY_ADDRESS=0x...

# Address of your deployed IDataStream contract (registered alongside the operator)
DATASTREAM_CONTRACT_ADDRESS=0x...

# Human-readable metadata
DATASTREAM_NAME=My Datastream
DATASTREAM_DESCRIPTION=A Nihilium datastream node
DATASTREAM_URL=https://datastream.example.com
DATASTREAM_TOR=

# Minimum seconds between signalling stake removal and withdrawing.
DATASTREAM_GRACE_PERIOD_SECONDS=43200
`;
}

export const command = "init";
export const describe = "Generate an example environment file in the current directory";

export function builder(yargs: Argv): Argv {
  return yargs
    .option("output", {
      alias: "o",
      type: "string",
      default: ".env.example",
      describe: "Path to write the example environment file to",
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      default: false,
      describe: "Overwrite the file if it already exists",
    });
}

export async function handler(argv: unknown): Promise<void> {
  const { output, force } = argv as { output: string; force: boolean };
  const target = resolve(process.cwd(), output);

  try {
    if (existsSync(target) && !force) {
      printError(`${output} already exists. Re-run with --force to overwrite it.`);
      process.exit(1);
    }

    writeFileSync(target, buildEnvTemplate(), { encoding: "utf8" });

    printSuccess(`Wrote example environment file to ${output}.`);
    printInfo("Baby Jubjub signing/HE keys were auto-generated — replace them before production use.");
    printInfo("Fill in the remaining keys and addresses, then rename it to .env (or copy the values).");
  } catch (e) {
    printException(e, "Failed to write example environment file");
    process.exit(1);
  }
}
