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

## Endpoint selection

- `new NihiliumClient({ apiUrl })` sets the registry API for that client, or call `setApiEndpoint(url)`
  to set the module-level default used by the helpers.
- `client.selectProcessors(filter, count)` / `client.selectDataStreams(filter, count)` resolve raw
  endpoints if you want to build a client manually.
- Filters support `jurisdiction`, `excludeJurisdiction`, `minStake`, `tor`, and a custom `where`
  predicate.
