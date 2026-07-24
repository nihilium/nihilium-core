import { babyJub, PubKey, PrivKey } from "./types";
import { subOrder as BJJ_SUBGROUP_ORDER } from "@zk-kit/baby-jubjub";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes, bytesToHex, concatBytes } from "@noble/hashes/utils";

/*
DLEQ attribution for partial decryptions (Chaum-Pedersen over Baby Jubjub)
=========================================================================
An EC-ElGamal ciphertext carries an ephemeral point ek = r·G. A processor holding
sk produces a partial decryption

    D = sk · ek

which is an EC point, not a scalar — the processor performs no discrete-log solving
(whitepaper §7.2). On its own D is deniable: nothing ties it to a specific key. A
Chaum-Pedersen DLEQ proof shows the SAME sk links the base pair and the ephemeral
pair:

    dlog_G(pk) == dlog_ek(D)      where pk = sk·G,  D = sk·ek

so anyone holding the registered pk can verify that D is that key holder's partial
decryption of ek. That makes a partial surfacing outside a valid unsealing flow
cryptographically attributable — and, together with the processor's signed
commitment, slashable (whitepaper §7.2, §8.2; the D_i = sk_HE_i·ek artefact).

Composite / layer-stripping case
--------------------------------
A ciphertext may be encrypted under a composite key pk_combo = pk_1 + ... + pk_k
(so the shared secret is S = r·pk_combo = Σ sk_i·ek). Attribution composes linearly:

  - A single-key partial   D_i = sk_i·ek        attributes to the registered pk_i
    → slashes operator i.
  - A combined partial      D = (Σ_{i∈T} sk_i)·ek attributes to the summed key
    pk_T = Σ_{i∈T} pk_i (e.g. a colluder that strips 4 of 5 layers is attributable
    to the sum of those 4 keys).

Either way `x·ek` is attributable to `x·G`; the honest protocol has each processor
emit its own single-key partial so attribution lands on one registered operator.

The prover knows x; the base points are G (for pk) and ek (for D). All points lie in
the prime-order subgroup, so scalars are reduced mod BJJ_SUBGROUP_ORDER and the
verification equations are exact.
*/

const L = BJJ_SUBGROUP_ORDER;
const DOMAIN = new TextEncoder().encode("nihilium/dleq/v1");

const mod = (a: bigint): bigint => ((a % L) + L) % L;

function randScalar(): bigint {
  let v = (BigInt("0x" + bytesToHex(randomBytes(32))) % L);
  if (v === 0n) v = 1n;
  return v;
}

// Fiat-Shamir challenge over the full transcript. Domain-separated so a proof for
// one statement cannot be replayed as any other Baby Jubjub DLEQ/Schnorr statement.
function challenge(
  B1: PubKey, P1: PubKey,
  B2: PubKey, P2: PubKey,
  A1: PubKey, A2: PubKey
): bigint {
  const preimage = concatBytes(
    DOMAIN,
    B1.toRawBytes(), P1.toRawBytes(),
    B2.toRawBytes(), P2.toRawBytes(),
    A1.toRawBytes(), A2.toRawBytes(),
  );
  return BigInt("0x" + bytesToHex(sha256(preimage))) % L;
}

export interface DLEQProof {
  c: bigint; // Fiat-Shamir challenge
  z: bigint; // response, z = v + c·x  (mod L)
}

/**
 * Chaum-Pedersen DLEQ: prove one secret x satisfies P1 = x·B1 AND P2 = x·B2,
 * without revealing x. For partial-decryption attribution use B1 = G (so P1 = pk)
 * and B2 = ek (so P2 = D).
 */
export function proveDLEQ(x: bigint, B1: PubKey, B2: PubKey): DLEQProof {
  const xr = mod(x);
  const P1 = B1.multiply(xr);
  const P2 = B2.multiply(xr);

  const v = randScalar();
  const A1 = B1.multiply(v);
  const A2 = B2.multiply(v);

  const c = challenge(B1, P1, B2, P2, A1, A2);
  const z = mod(v + mod(c * xr));
  return { c, z };
}

/**
 * Verify a Chaum-Pedersen DLEQ proof that the discrete logs of P1 (base B1) and
 * P2 (base B2) are equal. Returns false for any malformed or invalid proof.
 */
export function verifyDLEQ(
  B1: PubKey, P1: PubKey,
  B2: PubKey, P2: PubKey,
  proof: DLEQProof
): boolean {
  try {
    const { c, z } = proof;
    if (c <= 0n || c >= L || z <= 0n || z >= L) return false;

    // A1' = z·B1 − c·P1 ; A2' = z·B2 − c·P2  (equal to the prover's A1,A2 iff valid)
    const A1 = B1.multiply(z).subtract(P1.multiply(c));
    const A2 = B2.multiply(z).subtract(P2.multiply(c));

    return challenge(B1, P1, B2, P2, A1, A2) === c;
  } catch {
    return false;
  }
}

// --- Partial-decryption attribution (the protocol-facing API) ---

export interface AttributablePartial {
  D: PubKey; // the partial decryption sk·ek
  proof: DLEQProof; // binds D to pk = sk·G
}

/**
 * Produce an attributable partial decryption of ephemeral key ek under sk:
 * D = sk·ek together with a DLEQ proof binding D to pk = sk·G. `sk` may be a
 * single private key or the sum of several (for a layer-stripping partial).
 */
export function provePartialDecryption(sk: PrivKey, ek: PubKey): AttributablePartial {
  const D = ek.multiply(mod(sk));
  const proof = proveDLEQ(sk, babyJub.BASE, ek);
  return { D, proof };
}

/**
 * Attribute a partial decryption to a public key: returns true iff D is the
 * partial decryption sk·ek produced by the holder of pk = sk·G. This is the
 * on-chain slashing check — feed it the surfaced partial D, the public ephemeral
 * ek, the registered pk, and the proof (whitepaper §8.2).
 */
export function attributePartialDecryption(
  pk: PubKey,
  ek: PubKey,
  partial: AttributablePartial
): boolean {
  return verifyDLEQ(babyJub.BASE, pk, ek, partial.D, partial.proof);
}

/**
 * Recover WHICH subset of candidate keys produced a combined partial decryption,
 * attributing it to all of its constituents. The DLEQ proof validates against
 * exactly one public key — the sum x·G of the secret the prover used — so we
 * enumerate subsets, sum their public keys, and return the one whose sum the proof
 * accepts. Uses only public data (candidate keys, ephemeral, partial + proof); no
 * ephemeral secret and no DDH break required, because the proof carries the DH
 * witness.
 *
 * Returns the matching candidate indices, or null if no subset of the candidates
 * accounts for the partial — e.g. an additive mask that folds in a non-candidate
 * key (the honest protocol's composite structure is designed to prevent that, and
 * the sealing-time membership proof records the true subset so this brute force is
 * only a fallback). Soundness: a validating subset is unforgeable evidence, since
 * producing the proof requires knowing the sum of that subset's private keys.
 *
 * Cost is exponential in the candidate count (2^n subset tests); intended for the
 * small candidate sets of a single combination. Throws above `maxCandidates`.
 */
export function attributeCombinedPartial(
  candidatePubKeys: PubKey[],
  ek: PubKey,
  partial: AttributablePartial,
  opts: { minSize?: number; maxCandidates?: number } = {}
): number[] | null {
  const { minSize = 1, maxCandidates = 20 } = opts;
  const n = candidatePubKeys.length;
  if (n > maxCandidates) {
    throw new Error(`attributeCombinedPartial: ${n} candidates exceeds maxCandidates=${maxCandidates}`);
  }

  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length < minSize) continue;

    let sum = candidatePubKeys[idx[0]];
    for (let j = 1; j < idx.length; j++) sum = sum.add(candidatePubKeys[idx[j]]);

    if (attributePartialDecryption(sum, ek, partial)) return idx;
  }
  return null;
}

// --- Serialisation (for storage / transport / on-chain evidence) ---

export interface SerializedPartial {
  D: string; // compressed point hex
  c: string; // scalar hex
  z: string; // scalar hex
}

const scalarToHex = (s: bigint): string => s.toString(16);
const hexToScalar = (h: string): bigint => BigInt("0x" + h);

export function serializePartial(partial: AttributablePartial): SerializedPartial {
  return {
    D: partial.D.toHex(),
    c: scalarToHex(partial.proof.c),
    z: scalarToHex(partial.proof.z),
  };
}

export function deserializePartial(s: SerializedPartial): AttributablePartial {
  return {
    D: babyJub.fromHex(s.D),
    proof: { c: hexToScalar(s.c), z: hexToScalar(s.z) },
  };
}
