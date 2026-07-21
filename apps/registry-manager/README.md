# registry-manager

CLI for managing Nihilium processor and datastream registry entries.

Published to npm as [`nihilium-registry`](https://www.npmjs.com/package/nihilium-registry).

## Install & run (published package)

No clone or build required — with Node.js ≥ 20 installed:

```bash
# Run without installing (downloads + caches on first use)
npx nihilium-registry <command> [options]

# ...or install once, globally
npm install -g nihilium-registry
nihilium-registry <command> [options]
```

Configuration is read from a `.env` file in the **current working directory**
(see [Configuration](#configuration)), so run the CLI from a directory that
contains your `.env`:

```bash
cp .env.example .env   # then fill it in
npx nihilium-registry processor status
```

## Local development

```bash
cd apps/registry-manager
cp .env.example .env
# edit .env with your keys and addresses
npm install
```

## Configuration

All configuration is via environment variables, loaded from `.env` in the current directory.

| Variable | Required | Description |
|---|---|---|
| `RPC_URL` | yes | JSON-RPC endpoint (e.g. Avalanche Fuji testnet) |
| `CHAIN_ID` | no | Chain ID, defaults to `43113` (Fuji) |
| `PROCESSOR_PRIVATE_KEY` | processor cmds | Ethereum private key for transaction signing |
| `PROCESSOR_HE_PRIVATE_KEYS` | processor cmds | Baby Jubjub HE private key(s), comma-separated |
| `PROCESSOR_SIGNING_PRIVATE_KEYS` | processor cmds | Baby Jubjub signing private key(s), comma-separated |
| `PROCESSOR_REGISTRY_ADDRESS` | processor cmds | Deployed `ProcessorRegistry` contract address |
| `PROCESSOR_NAME` | optional | Human-readable name shown in the registry |
| `PROCESSOR_DESCRIPTION` | optional | |
| `PROCESSOR_URL` | optional | Public HTTPS endpoint |
| `PROCESSOR_TOR` | optional | Tor `.onion` endpoint |
| `PROCESSOR_GRACE_PERIOD_SECONDS` | optional | Seconds between signal and withdraw, default `86400` (1 day) |
| `DATASTREAM_PRIVATE_KEY` | datastream cmds | |
| `DATASTREAM_SIGNING_PRIVATE_KEYS` | datastream cmds | Baby Jubjub signing key(s), comma-separated |
| `DATASTREAM_REGISTRY_ADDRESS` | datastream cmds | Deployed `DatastreamRegistry` contract address |
| `DATASTREAM_CONTRACT_ADDRESS` | datastream register | Your deployed `IDataStream` contract |
| `DATASTREAM_NAME` | optional | |
| `DATASTREAM_DESCRIPTION` | optional | |
| `DATASTREAM_URL` | optional | |
| `DATASTREAM_TOR` | optional | |
| `DATASTREAM_GRACE_PERIOD_SECONDS` | optional | Default `43200` (12 hours) |

`*_REGISTRY_ADDRESS` can be omitted if the chain is listed in `@nihilium/registry`'s built-in address book.

## Running

### Development (ts-node, no build needed)

```bash
npm run dev -- <command> [options]
# e.g.
npm run dev -- processor status
```

### Production (bundled)

`npm run build` uses esbuild to bundle the CLI and its entire dependency graph
(including the `@nihilium/*` workspace packages) into a single self-contained
`dist/cli.js` with a `#!/usr/bin/env node` shebang. This is what gets published,
which is why `npx nihilium-registry` needs no dependency installation.

```bash
npm run build
node dist/cli.js <command> [options]
# or, if installed globally / via `npm link`:
nihilium-registry <command> [options]
```

### Publishing

`prepublishOnly` type-checks and rebuilds the bundle automatically:

```bash
npm publish            # public npm registry
# For a private registry, point npm at it, e.g.:
#   npm publish --registry https://npm.your-org.example
```

## Commands

### Processor

```
processor status
    Show registration status, metadata, and all registered keys.

processor register
    Register this processor and upload all configured keys.
    Safe to run multiple times — already-registered entries are skipped.

processor keys list [--all]
    List active keys. Pass --all to include inactive ones.

processor keys deactivate <keyId>
    Permanently deactivate a key (prompts for confirmation).
    keyId is the 0x-prefixed bytes32 keccak256(keyX, keyY).

processor keys derive
    Derive public key coordinates for all keys in PROCESSOR_HE_PRIVATE_KEYS
    and PROCESSOR_SIGNING_PRIVATE_KEYS without sending a tx.
    Prints x and y in decimal form, and keyId in 0x-prefixed hex.

processor keys generate [--count N] [--out <file>]
    Generate new 248-bit Baby Jubjub HE (ECElGamal) private key(s).
    Only the public x, y and keyId are printed — the private key is copied
    straight to your system clipboard so it never reaches the terminal,
    scrollback or shell history. Paste it into PROCESSOR_HE_PRIVATE_KEYS
    (comma-separated for multiple keys), then run `processor register`.

    Clipboard support: wl-copy, xclip or xsel on Linux, pbcopy on macOS,
    clip on Windows/WSL, with an OSC 52 terminal escape as fallback over SSH.
    On a headless box with none of those, use --out <file> to write the key
    to a 0600 file instead. Nothing is printed if the copy fails.

processor stake list
    Show active stake and any pending removals for ETH and
    all committee-approved ERC-20 tokens.

processor stake add [token] <amount>
    Deposit stake. Omit token (or use 0x000…) for ETH.
    Amount is in ether units for ETH, raw units for ERC-20.
    Prompts for confirmation before submitting.

processor stake signal [token] <amount>
    Signal that you want to remove <amount> of stake.
    Starts the grace period. Funds are not moved yet.

processor stake finalize [token]
    Withdraw the pending removal after the grace period has elapsed.
```

### Datastream

Mirrors the processor commands, with one addition:

```
datastream register
    Requires DATASTREAM_CONTRACT_ADDRESS to be set — this is the
    address of your deployed IDataStream contract that the operator
    entry points to.
```

All other `datastream` subcommands (`status`, `keys list`, `keys deactivate`,
`stake list/add/signal/finalize`) work identically to their processor counterparts.

## Typical workflows

### First-time registration

```bash
# 1. Fill in .env
# 2. Register and upload all keys in one shot
npm run dev -- processor register
# 3. Verify
npm run dev -- processor status
```

### Rotating a signing key

```bash
# Deactivate the old key (you'll need its keyId from `keys list`)
npm run dev -- processor keys deactivate 0xabc...

# Add a new private key to PROCESSOR_SIGNING_PRIVATE_KEYS, then re-run register
npm run dev -- processor register
```

### Staking

```bash
# Deposit 2 ETH
npm run dev -- processor stake add 2.0

# Later: begin removal of 1 ETH (grace period starts now)
npm run dev -- processor stake signal 1.0

# After grace period has passed:
npm run dev -- processor stake finalize
```

### Staking an ERC-20

```bash
# List what tokens are allowed
npm run dev -- processor stake list

# Deposit 1000 tokens (raw units)
npm run dev -- processor stake add 0xTokenAddress 1000

# The CLI will request ERC-20 approval automatically before depositing.
```

## Architecture

The app has three layers, making it straightforward to promote to a web dashboard later:

```
src/lib/       — pure async functions, zero terminal I/O (reusable by Express routes)
src/commands/  — yargs handlers: call lib, pass results to ui/
src/ui/        — all chalk / cli-table3 / inquirer code in one place
```

To plug the same business logic into an Express API, import functions from `src/lib/` directly and skip the `src/ui/` layer.
