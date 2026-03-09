# @nihilium/aonae

All-or-Nothing Authenticated Encryption (AONAE) for the Nihilium sealed package protocol.

AONAE wraps content and peer processor payloads into an indivisible ciphertext. Decryption requires recovering the sealed private key via the full unsealing protocol — partial data yields nothing. A covert signal token, committed in the public observer package, proves after the fact whether an out-of-protocol decryption occurred.

**Encryption stack:** ephemeral Baby Jubjub ECDH → Argon2id (1 GB, memory-hard) → Rivest AONT → AES-256-GCM.

---

## Install

```bash
npm install @nihilium/aonae circomlibjs argon2-browser @noble/hashes
```

---

## Quick start

```typescript
import { seal, unseal, verifySignal } from "@nihilium/aonae";
import { generateKeypair } from "@nihilium/aonae";
import type { ProcessorPayload, Argon2Params } from "@nihilium/aonae";

// --- Key setup ---
// In production, pkF comes from the Nihilium sealing protocol (§5.2).
// Here we simulate a sealed key with a standalone BJJ keypair.
const sealedKey = await generateKeypair();

// --- Seal ---
const content = new TextEncoder().encode("my secret document");

const { ciphertext, signalCommitment } = await seal(
  content,
  [],              // peer payloads for other processors (empty in this example)
  sealedKey.publicKey,
  "processor-1",  // ID of the target processor
);

// ciphertext  → stored in the private sealed package
// signalCommitment → stored in the public observer package

// --- Unseal (normal flow, client has recovered KF) ---
const payload = await unseal(ciphertext, sealedKey.privateKey);
console.log(new TextDecoder().decode(payload.content)); // "my secret document"

// --- Signal verification ---
// If processor-1 ever decrypts out-of-protocol, it publishes payload.signal.
// Any observer can verify it against the public commitment:
const compromised = verifySignal(payload.signal, signalCommitment);
console.log(compromised); // true — decryption occurred
```

---

## API

### `seal(content, peerPayloads, pkF, processorId, argon2Params?)`

Encrypts content for a specific processor. Returns a `SealResult` containing:

- **`ciphertext`** (`AONAECiphertext`) — the sealed package. Store privately.
- **`signalCommitment`** (`SignalCommitment`) — `H(signal)` bound to the processor ID. Store publicly.

```typescript
import { seal } from "@nihilium/aonae";
import type { ProcessorPayload, Argon2Params } from "@nihilium/aonae";

const peerPayloads: ProcessorPayload[] = [
  {
    processorId: "processor-2",
    ciphertexts: new Uint8Array(/* HE-encrypted key chunks */),
    commitment: new Uint8Array(/* severed commitment */),
    metadata: new Uint8Array(/* unseal params */),
  },
];

const result = await seal(content, peerPayloads, pkF, "processor-1");
```

**Argon2 parameters** (optional, default: 1 GB / 3 iterations / 4 lanes):

```typescript
const params: Argon2Params = {
  memory: 1048576,  // KiB — 1 GB intentional; makes ZK proofs of decryption infeasible
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
};
const result = await seal(content, peerPayloads, pkF, "processor-1", params);
```

> **Browser note:** Argon2id runs in WASM and blocks the main thread. Run it in a Web Worker for production browser usage.

---

### `unseal(sealed, kF)`

Client-side normal unseal. Requires the full recovered private key `KF`.

```typescript
import { unseal } from "@nihilium/aonae";

const payload = await unseal(ciphertext, kF);

// payload.content       — the original content bytes
// payload.peerPayloads  — peer processor payloads (client should discard)
// payload.signal        — covert signal token (client should discard)
// payload.nonce         — freshness nonce
```

Throws if the ciphertext has been tampered with (AES-GCM authentication failure).

---

### `unsealAsProcessor(sealed, k1, k2)`

Processor-side out-of-protocol unseal. Reconstructs `KF = K1 + K2 mod subOrder` and decrypts, giving the processor full visibility into all fields.

```typescript
import { unsealAsProcessor } from "@nihilium/aonae";

const { payload, signal, peerPayloads } = await unsealAsProcessor(
  sealed,
  k1,  // processor's key component
  k2,  // client's key component (provided by requestor)
);

// The processor now holds:
// - payload.content       — the sealed content
// - signal                — can be published to prove out-of-protocol decryption
// - peerPayloads          — payloads for other processors in the threshold set
```

---

### `verifySignal(publishedSignal, commitment)`

Observer-side signal verification. Returns `true` if the signal matches the commitment, proving an out-of-protocol decryption occurred for this seal.

```typescript
import { verifySignal } from "@nihilium/aonae";

const isCompromised = verifySignal(publishedSignal, signalCommitment);
```

Uses constant-time comparison to prevent timing side-channels.

---

### `generateKeypair()`

Generate a random Baby Jubjub keypair. In production, `pkF` comes from the Nihilium sealing protocol; this is provided for testing and standalone use.

```typescript
import { generateKeypair } from "@nihilium/aonae";

const { privateKey, publicKey } = await generateKeypair();
// privateKey: Uint8Array (32 bytes, scalar mod subgroup order)
// publicKey:  [bigint, bigint] (affine coordinates)
```

---

### `ecdh(privateKey, publicKey)`

Baby Jubjub ECDH. Returns the x-coordinate of the shared point as 32 bytes.

```typescript
import { ecdh } from "@nihilium/aonae";

const shared = await ecdh(alice.privateKey, bob.publicKey);
// symmetric: ecdh(alice.priv, bob.pub) == ecdh(bob.priv, alice.pub)
```

---

### `deriveKey(sharedSecret, salt, params?)`

Argon2id key derivation. Returns 32-byte derived key.

```typescript
import { deriveKey, generateSalt, DEFAULT_ARGON2_PARAMS } from "@nihilium/aonae";

const salt = generateSalt();
const key = await deriveKey(sharedSecret, salt, DEFAULT_ARGON2_PARAMS);
```

---

### `aontEncode(plaintext)` / `aontDecode(encoded)`

Rivest All-or-Nothing Transform. Altering or omitting any block corrupts the entire output.

```typescript
import { aontEncode, aontDecode } from "@nihilium/aonae";

const encoded = await aontEncode(plaintext);
const decoded = await aontDecode(encoded); // identical to plaintext
```

---

### `encrypt(key, plaintext)` / `decrypt(key, ciphertext, iv)`

AES-256-GCM. The auth tag is appended to the ciphertext by the Web Crypto API.

```typescript
import { encrypt, decrypt } from "@nihilium/aonae";

const { ciphertext, iv } = await encrypt(key, plaintext);
const recovered = await decrypt(key, ciphertext, iv); // throws on tamper
```

---

## Threshold set example (3-of-3)

```typescript
import { seal, unseal, verifySignal, generateKeypair } from "@nihilium/aonae";
import type { ProcessorPayload } from "@nihilium/aonae";

// In production, each processor runs the sealing protocol independently.
// Here we simulate three sealed keys.
const [p1Key, p2Key, p3Key] = await Promise.all([
  generateKeypair(),
  generateKeypair(),
  generateKeypair(),
]);

// Build peer payloads (what each processor needs to know about the others)
const p2Payload: ProcessorPayload = {
  processorId: "P2",
  ciphertexts: new Uint8Array(/* P2's HE-encrypted key chunks */),
  commitment: new Uint8Array(/* P2's severed commitment */),
  metadata: new Uint8Array(/* P2's unseal params */),
};
const p3Payload: ProcessorPayload = {
  processorId: "P3",
  ciphertexts: new Uint8Array(/* P3's HE-encrypted key chunks */),
  commitment: new Uint8Array(/* P3's severed commitment */),
  metadata: new Uint8Array(/* P3's unseal params */),
};

const content = new TextEncoder().encode("top secret");

// Seal for P1 — embed peer payloads for P2 and P3
const { ciphertext, signalCommitment } = await seal(
  content,
  [p2Payload, p3Payload],
  p1Key.publicKey,
  "P1",
);

// Normal unseal: client recovers KF and decrypts
const payload = await unseal(ciphertext, p1Key.privateKey);
console.log(new TextDecoder().decode(payload.content)); // "top secret"

// Accountability: if P1 ever decrypts out-of-protocol and publishes signal,
// any observer can prove it
const isCompromised = verifySignal(payload.signal, signalCommitment);
console.log(isCompromised); // true
```

---

## Types

```typescript
type BJJPoint = [bigint, bigint];

interface BJJKeypair {
  privateKey: Uint8Array;  // 32-byte scalar
  publicKey: BJJPoint;
}

interface ProcessorPayload {
  processorId: string;
  ciphertexts: Uint8Array;
  commitment: Uint8Array;
  metadata: Uint8Array;
}

interface AONAEPayload {
  content: Uint8Array;
  peerPayloads: ProcessorPayload[];
  signal: Uint8Array;   // 32 bytes
  nonce: Uint8Array;    // 32 bytes
}

interface AONAECiphertext {
  ciphertext: Uint8Array;
  iv: Uint8Array;           // 12 bytes
  authTag: Uint8Array;      // 16 bytes (included in ciphertext)
  publicKey: BJJPoint;      // ephemeral ECDH public key
  argon2Params: Argon2Params;
  salt: Uint8Array;         // 32 bytes
}

interface Argon2Params {
  memory: number;      // KiB
  iterations: number;
  parallelism: number;
  hashLength: number;
}

interface SignalCommitment {
  processorId: string;
  commitment: Uint8Array;  // SHA-256(signal)
}

interface SealResult {
  ciphertext: AONAECiphertext;
  signalCommitment: SignalCommitment;
}
```

---

## Security notes

**Memory-hard KDF.** The 1 GB Argon2id parameter is intentional — it is the mechanism that makes ZK proofs of correct decryption infeasible. Lowering it reduces this guarantee.

**Key destruction.** `Uint8Array.fill(0)` is best-effort in JavaScript. For security-critical deployments, use a WASM module or secure enclave where memory can be controlled precisely.

**AONT ordering.** The AONT is applied _before_ AES-GCM. The GCM auth tag therefore protects the AONT output. A failed auth check aborts before AONT inversion — no partial information is leaked.

**Serialization.** The built-in payload serialization is simple and sufficient for the protocol. For cross-platform interoperability, replace it with a canonical format (protobuf, CBOR, ASN.1 DER).
