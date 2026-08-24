# @nihilium/client-sdk

Browser/Node SDK for the Nihilium protocol: split a secret across **k-of-n** processors (sealing),
then recover it from any **k** of them (unsealing). This package is a thin, configured wrapper over
`@nihilium/core` — it selects processors/datastreams from the registry and wires them into the two
high-level clients, `NihiliumSealingClient` and `NihiliumUnsealingClient`.

> The low-level single-share process classes are **not** part of the public API. Use the clients
> below.

## Install

```bash
npm install @nihilium/client-sdk
```

`@nihilium/client-sdk` re-exports everything from `@nihilium/core`, so you can import the clients,
`types`, `cryptoTools`, `createRevealOnlyCollection`, `NETWORK_IDS`, the payment providers, and the
state stores directly from it.

## Concepts

- **Seal** → produces a `NihiliumSeal`: one package per processor (each with its own
  `constructed_public_key` and reveal value) plus a single combinatorial-threshold `fdt_seal`.
  **Sealing calls a paid endpoint** (`/request_seal`) — supply a `PaymentProvider` for authorized
  processors.
- **Unseal** → recovers the secret from **any k** of the n processors via `fdt_seal`. **Unsealing is
  never paid.**
- Store the `NihiliumSeal` yourself (it is JSON-serializable); you need it to unseal later.
- Both clients are **resumable**: they persist progress to an injectable state store (browser
  `localStorage` by default, in-memory otherwise), so a crash mid-flight can continue without
  re-charging processors or re-running ZK proofs.

## Quick start

```ts
import {
  NihiliumClient,
  createRevealOnlyCollection,
  NETWORK_IDS,
  cryptoTools,
} from "@nihilium/client-sdk";

const client = new NihiliumClient({
  apiUrl: "https://api.nihilium.io", // registry / endpoint-selection API
  network: NETWORK_IDS.ARBITRUM,
});

// 1) Choose an unseal policy. The built-in reveal-only template unseals as soon as the reveal
//    value is published to the datastream.
const { collection, template } = createRevealOnlyCollection(NETWORK_IDS.ARBITRUM);

// 2) Seal a secret across 3 processors, 2 required to recover (2-of-3).
const secret = cryptoTools.generateRandom248BitNumber(); // the bigint you want to protect
const metadataRoot = 0n;                                  // optional metadata commitment

const sealing = await client.sealingClient({
  template,
  threshold: 2,
  processorCount: 3,
  // payment: new NihiliumPaymentProvider("https://your-server.example"),  // for paid processors
});
const seal = await sealing.start_sealing(secret, metadataRoot);

// Persist the seal — you need it to unseal.
const stored = JSON.stringify(seal);

// 3) Later: recover the secret from any k = 2 of the processors.
const unsealing = await client.unsealingClient(JSON.parse(stored), { collection });
const recovered = await unsealing.start_unsealing([0, 1]); // any 2-subset of processor indices
console.log(recovered === secret); // true
```

## Sealing

```ts
const sealing = await client.sealingClient({
  template,                 // an UnsealConditionTemplate (e.g. from createRevealOnlyCollection)
  threshold: 2,             // k — processors required to recover
  processorCount: 3,        // n — processors to seal across (default: threshold)
  searchWidth: 1,           // optional FDT search width m (defender-side hardening)
  filter: { jurisdiction: ["US", "NL"], minStake: 10n ** 18n }, // optional processor selection
  payment: paymentProvider, // optional PaymentProvider; omit for unauthenticated processors
});

const seal = await sealing.start_sealing(secret, metadataRoot);
```

- Returns an unstarted `NihiliumSealingClient`; call `start_sealing(secret, metadataRoot)` to run it.
- `data_stream_mapping` is auto-derived for single-datastream templates like reveal-only. For
  multi-datastream templates pass it explicitly:
  `start_sealing(secret, metadataRoot, {}, { myStreamId: dataStreamAddress })`.
- Progress: `sealing.get_status()`, `sealing.is_done()`, `sealing.get_seal()`.

## Unsealing

```ts
const unsealing = await client.unsealingClient(seal, { collection });
const secret = await unsealing.start_unsealing([0, 1]); // exactly k = seal.fdt_seal.threshold indices
```

- Resolves the processors and datastreams recorded in the seal (processor `i` ↔ `seal.packages[i]`).
- `start_unsealing` publishes the chosen reveal values to the datastream (batched), waits for them
  to become provable, produces the unseal proofs, and recovers the secret via `fdt_seal`.
- Progress: `unsealing.get_status()`, `unsealing.is_done()`, `unsealing.get_secret()`.

## Resumability

Both clients persist state at every step. Inject a store and re-run to resume:

```ts
import { InMemorySealingStateStore } from "@nihilium/client-sdk";

const store = new InMemorySealingStateStore(); // or your own ClientStateStore; localStorage in-browser
sealing.set_state_store(store);

try {
  await sealing.start_sealing(secret, metadataRoot);
} catch {
  // A new client with the same store (and same inputs) picks up where it left off:
  const resumed = await client.sealingClient({ template, threshold: 2, processorCount: 3 });
  resumed.set_state_store(store);
  const seal = await resumed.start_sealing(secret, metadataRoot); // no re-charge of completed processors
}
```

Unsealing works the same way with an `InMemoryUnsealingStateStore` — already-recovered processors are
skipped on resume (their proofs are not re-run).

## Zero-config helpers

For the default reveal-only policy and registry defaults:

```ts
import { getDefaultSealingClient, getDefaultUnsealingClient } from "@nihilium/client-sdk";

const sealing = await getDefaultSealingClient({ threshold: 2, processorCount: 3 });
const seal = await sealing.start_sealing(secret, metadataRoot);

const unsealing = await getDefaultUnsealingClient(seal);
const secret2 = await unsealing.start_unsealing([0, 1]);
```

## Scenarios

A **scenario** is a ready-made seal/unseal policy plus the client that drives it — unseal conditions,
proof production and the external services they talk to, wrapped so a caller only supplies the inputs
that are actually theirs. Each one lives under its own subpath:

```ts
import { … } from "@nihilium/client-sdk/scenarios/zkemail";
```

The subpath is the path to use. These symbols are also re-exported from the package root for
compatibility, but the root surface is the protocol itself — scenarios are namespaced so the set can
grow without the root growing with it.

## Scenario: ZKEmail

Seal a value behind a **recovery email**: to unseal, the owner replies to a mail from the recovery
service, and a ZK proof of that reply satisfies the unseal conditions. The unseal path is
`[opening → HashTie → ZKEmail]`, compiled from `zk-email-full.json`; the only user input it needs is a
hash of the recovery address, so the address itself is never published.

Sealing mints a **BabyJubJub vault keypair**: the private half is what the k-of-n threshold protects and
is then discarded, and the public half is published on the seal. Your value is encrypted *to that public
key*, which is why more data can be added to the same vault later with no unseal and no network — see
[Encrypting into the vault later](#encrypting-into-the-vault-later).

### 1. Check the address before you seal

```ts
import { checkEmailDomain, domainVerdict } from "@nihilium/client-sdk/scenarios/zkemail";

const check = await checkEmailDomain("https://zkemail.nihilium.io", "user@example.com");

switch (domainVerdict(check)) {
  case "eligible":
    break;                       // the registry holds a DKIM key for it — safe to seal
  case "needs_registration":     // provable, but the service must observe the current key first
  case "unverified":             // no DKIM record found; recovery would be a guess
    throw new Error(
      `Send any email from this address to recovery@nihilium.io to register ${check.domain}, ` +
      `then check again — or use an address at another domain.`);
  case "unsupported":
    throw new Error(`${check.domain} cannot be proven against; it is not recoverable.`);
}
```

Only the **domain** is sent, never the full address. Do this before sealing: a seal made against an
address that cannot be proven produces a vault nobody can ever open, and that failure only surfaces at
recovery time, when nothing can be done about it. Read the verdict through `domainVerdict` rather than
the raw flags — a response with every flag `false` means *no record found*, not approval.

### 2. Seal

```ts
import { ZKEmailSealingClient } from "@nihilium/client-sdk/scenarios/zkemail";
import { NETWORK_IDS, NihiliumPaymentProvider } from "@nihilium/client-sdk";

const sealing = await ZKEmailSealingClient.create({
  email: "user@example.com",
  threshold: 3,                  // k — processors required to recover
  processorCount: 5,             // n — processors to seal across (default: threshold)
  network: NETWORK_IDS.SEPOLIA,
  emailServiceUrl: "https://zkemail.nihilium.io", // recorded on the seal, so a recovery needs nothing else
  payment: new NihiliumPaymentProvider("https://your-server.example"),
});

const seal = await sealing.seal("my-super-secret-password");
await fs.writeFile("vault.nh", JSON.stringify(seal));   // the seal is all a recovery needs
```

`create()` selects processors and datastreams from the registry and initializes them; pass `processors`
/ `dataStreams` explicitly to override that (which is how you point every share at one processor for
local testing). `seal()` returns a `NihiliumSeal` carrying `vault_public_key`, the encrypted value and
the recovery email — nothing else has to be stored alongside it.

**Showing progress.** Sealing runs one ZK proof per processor, so a 5-of-5 seal is five multi-second
proofs. Subscribe to report on it:

```ts
const sealing = await ZKEmailSealingClient.create({
  …,
  // Structured — drive a progress bar from this.
  onSealProgress: (e) => console.log(`${e.completed}/${e.total}`, e.stage, e.processor_index),
  // Human-readable, derived from the same events: "Proving share 2 of 5..."
  onProgress: (message) => console.log(message),
});
```

`completed` is derived from persisted state, so a **resumed** seal reports the work already done rather
than restarting at zero. Steps are counted, not time-weighted, so the bar advances unevenly — the paid
POST is fast and the proof is seconds.

### 3. Unseal

```ts
import { ZKEmailUnsealingClient, ZKEmailUnsealPhase } from "@nihilium/client-sdk/scenarios/zkemail";

const seal = JSON.parse(await fs.readFile("vault.nh", "utf8"));

const unsealing = await ZKEmailUnsealingClient.fromSeal(seal, {
  network: NETWORK_IDS.SEPOLIA,
  onPhase: (phase) => {
    if (phase === ZKEmailUnsealPhase.AwaitingEmailReply) {
      showBanner("Check your inbox and reply to the recovery email.");
    }
  },
  onProgress: (message) => console.log(message),
});

const recovered = await unsealing.unseal();   // "my-super-secret-password"
```

`fromSeal` resolves the processors, datastreams and contract address map recorded in the seal, so it
takes no positional arguments and no `emailServiceUrl` (the seal carries one; pass it to override).
`unseal()` runs the whole flow — recovery-email exchange, proof production across k processors, and
decryption of the vault blob.

Drive UI off `onPhase`, not the progress strings, which are free to be reworded. The phases are
`Preparing → AwaitingEmailReply → Proving → Unsealing → Done`. **`AwaitingEmailReply` is unbounded** —
it waits on a human — so it is the one phase to show as indeterminate.

To fail fast on a seal whose domain has since become unrecoverable:

```ts
const verdict = domainVerdict(await unsealing.checkRecoveryEmailDomain());
```

### Encrypting into the vault later

The published `vault_public_key` means anyone holding the seal can add data to the vault without an
unseal, without the recovery email, and without touching the network:

```ts
import { encryptForVault } from "@nihilium/client-sdk";

// Any time after sealing — no unseal, no key material, no network.
const blob = await encryptForVault(seal.vault_public_key!, "a second secret");

// Recoverable only by a real k-of-n unseal, with the same client that recovered the value.
await unsealing.unseal();
const secondSecret = await unsealing.decrypt_vault_blob_to_string(blob);
```

`decrypt_vault_blob` returns the raw `Uint8Array` for non-text payloads. Both require a finished
unseal — that is what puts the vault private key back in memory.

### Resuming a ZKEmail flow

The ZKEmail clients inherit the state stores described in [Resumability](#resumability), and persist the
scenario's own work too: a resumed unseal reuses the same email subject rather than sending a second
recovery email, and a resumed seal re-embeds the same ciphertext rather than re-encrypting under a fresh
ephemeral key.

### Notes

- Seals created before the vault-keypair change carry no `vault_public_key` and are not recoverable by
  this client; `unseal()` says so explicitly rather than failing with a type error.
- `hashEmailAddress(address)` is exported for callers that need the value the circuit commits to. It
  rejects addresses over 256 bytes rather than truncating, since a truncated hash produces a proof that
  will never verify.

## Endpoint selection

- `new NihiliumClient({ apiUrl })` sets the registry API for that client, or call `setApiEndpoint(url)`
  to set the module-level default used by the helpers.
- `client.selectProcessors(filter, count)` / `client.selectDataStreams(filter, count)` resolve raw
  endpoints if you want to build a client manually.
- Filters support `jurisdiction`, `excludeJurisdiction`, `minStake`, `tor`, and a custom `where`
  predicate.
