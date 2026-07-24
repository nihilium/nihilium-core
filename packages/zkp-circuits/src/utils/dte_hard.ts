import { babyJub } from "./types";
import { PubKey, PrivKey } from "./types";
import {
  generateRandom240BitNumber,
  toBytesLE,
  encryptECCBabyJub,
  decryptECCBabyJub,
  bigInt2Buffer,
  bufferToBigInt,
} from "./tools";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";

/*
Combinatorial Threshold Encryption — Search-Width (m) Variant
=============================================================
Standalone implementation of the combinatorial threshold primitive described in
the Nihilium whitepaper §9.3, extended with the search-width parameter m (§6.4–6.5,
§9.5). It is *not* the full protocol path: it operates directly on raw keypairs and
uses XOR-KDF EC-ElGamal rather than the composite-key homomorphic scheme, so the
sealer (not the processors) generates the lane scalars, and there is no DLEQ
attribution or DLP-in-MPC barrier here. Those properties live in the real
sealing/unsealing code. What this file demonstrates is the m^k path-search structure.

Construction per qualifying k-subset (combination) of the n public keys:

  Lanes (§6.4)
    For each member i of the combination, generate m random 240-bit scalars
    w[i][0..m-1] and EC-ElGamal-encrypt each under member i's public key. Recovering
    member i's lane scalars therefore requires member i's private key — this is what
    enforces the k-of-n threshold: every member must cooperate to recover all lanes.

  Hidden path + vault key (§6.5)
    A secret path selects one lane per member, p = (p_0, ..., p_{k-1}). The vault
    private key is the sum of the selected lane scalars:
        sk_vault = Σ w[i][p_i]          pk_vault = sk_vault · G
    A random indirection scalar z is EC-ElGamal-encrypted under pk_vault, and pk_z =
    z · G is published as a verification anchor. The payload is sealed as
        payload = message ⊕ sha256(z)

  Recovery (§9.3 step 5, §9.5)
    A qualifying k-subset decrypts all m×k lane scalars, then searches the m^k
    candidate paths: for each path it trial-decrypts z under the candidate vault key
    and accepts the path whose recovered z satisfies z · G == pk_z. The path is not
    stored in the package, so the m^k search is intrinsic to recovery-from-package —
    this is the defender-side m^k cost of §9.5.

Parameters:
  k (threshold): members required to recover.        Range 3–5 typical.
  m (search width): lanes per member per combination. Range 5–20 typical (§1.5).
    Defender pays linear cost in m at sealing and m^k at the local unsealing search.
    m=1 collapses to a plain combinatorial threshold (single lane, no search).
*/

export interface EccCiphertext {
  c: string; // hex ciphertext
  R: { x: string; y: string }; // ephemeral public key (as serialised by encryptECCBabyJub)
}

export interface CombinationSeal {
  members: string[]; // member public keys (toHex), sorted — defines lane ordering
  lanes: EccCiphertext[][]; // lanes[memberPos][laneIdx] = Enc_{pk_member}(w[memberPos][laneIdx])
  pkZ: string; // (z · G).toHex() — verification anchor for the path search
  zSeal: EccCiphertext; // Enc_{pk_vault}(z)
  payload: string; // hex(message ⊕ sha256(z))
}

export interface FDTSealedPackage {
  m: number;
  threshold: number;
  // Keyed by combinationIndex(members) so a recovering k-subset can locate its combination.
  combinations: { [index: string]: CombinationSeal };
}

export function FDTEncrypt(
  message: bigint,
  pubKeys: PubKey[],
  threshold: number,
  m = 1
): FDTSealedPackage {
  if (threshold > pubKeys.length) {
    throw new Error("Threshold is greater than the number of public keys");
  }
  if (threshold < 1) {
    throw new Error("Threshold is less than 1");
  }
  if (m < 1) {
    throw new Error("Search width m must be at least 1");
  }

  const msgBytes = bigInt2Buffer(message);
  const combinations: { [index: string]: CombinationSeal } = {};

  for (const indexSet of indexCombinations(pubKeys.length, threshold)) {
    // Canonical member ordering so seal and unseal agree on lane positions.
    const members = indexSet
      .map((i) => pubKeys[i])
      .sort((a, b) => a.toHex().localeCompare(b.toHex()));

    // --- Lanes: m random scalars per member, each encrypted under that member's key ---
    const laneScalars: bigint[][] = []; // [memberPos][laneIdx]
    const lanes: EccCiphertext[][] = [];

    for (const memberPubKey of members) {
      const memberScalars: bigint[] = [];
      const memberLanes: EccCiphertext[] = [];
      for (let j = 0; j < m; j++) {
        const w = generateRandom240BitNumber();
        const enc = encryptECCBabyJub(w, memberPubKey);
        memberScalars.push(w);
        memberLanes.push({ c: enc.ciphertextHex, R: enc.R });
      }
      laneScalars.push(memberScalars);
      lanes.push(memberLanes);
    }

    // --- Hidden path: select one lane per member, sum to the vault key ---
    let vaultSk = 0n;
    for (let pos = 0; pos < members.length; pos++) {
      const chosenLane = Math.floor(Math.random() * m);
      vaultSk += laneScalars[pos][chosenLane];
    }
    const vaultPk = babyJub.BASE.multiply(vaultSk);

    // --- Indirection scalar z: encrypted under the vault key, anchored by pk_z ---
    const z = generateRandom240BitNumber();
    const pkZ = babyJub.BASE.multiply(z).toHex();
    const zEnc = encryptECCBabyJub(z, vaultPk);

    // --- Payload sealed under KDF(z) ---
    const payload = xor(msgBytes, kdfFromZ(z, msgBytes.length));

    combinations[combinationIndex(members)] = {
      members: members.map((p) => p.toHex()),
      lanes,
      pkZ,
      zSeal: { c: zEnc.ciphertextHex, R: zEnc.R },
      payload: bytesToHex(payload),
    };
  }

  return { m, threshold, combinations };
}

export function FDTDecrypt(
  privateKeys: PrivKey[],
  pkg: FDTSealedPackage
): string {
  // Derive public keys and sort canonically to match the sealing order.
  const keyPairs = privateKeys
    .map((sk) => ({ sk, pk: babyJub.BASE.multiply(sk) }))
    .sort((a, b) => a.pk.toHex().localeCompare(b.pk.toHex()));

  const members = keyPairs.map((kp) => kp.pk);
  const seal = pkg.combinations[combinationIndex(members)];
  if (!seal) {
    throw new Error("No sealed combination matches this set of private keys");
  }

  const k = keyPairs.length;
  const m = pkg.m;

  // --- Recover every lane scalar: member pos decrypts its own lanes with its key ---
  const laneScalars: bigint[][] = []; // [memberPos][laneIdx]
  for (let pos = 0; pos < k; pos++) {
    const memberScalars = seal.lanes[pos].map((lane) =>
      decryptECCBabyJub(lane.c, lane.R, keyPairs[pos].sk)
    );
    laneScalars.push(memberScalars);
  }

  // --- Search the m^k candidate paths against the pk_z anchor ---
  const pkZPoint = babyJub.fromHex(seal.pkZ);
  const payloadBytes = hexToBytes(seal.payload);
  const totalPaths = m ** k;

  for (let n = 0; n < totalPaths; n++) {
    // Mixed-radix decode of n into a path (one lane index per member).
    let candidateSk = 0n;
    let rem = n;
    for (let pos = 0; pos < k; pos++) {
      const laneIdx = rem % m;
      rem = Math.floor(rem / m);
      candidateSk += laneScalars[pos][laneIdx];
    }

    const zCandidate = decryptECCBabyJub(seal.zSeal.c, seal.zSeal.R, candidateSk);
    if (babyJub.BASE.multiply(zCandidate).equals(pkZPoint)) {
      const message = xor(payloadBytes, kdfFromZ(zCandidate, payloadBytes.length));
      return bufferToBigInt(message).toString();
    }
  }

  throw new Error("No candidate path recovered the vault key (corrupt package?)");
}

// --- Helpers ---

/** Symmetric key stream from the indirection scalar z. */
function kdfFromZ(z: bigint, length: number): Uint8Array {
  return sha256(toBytesLE(z)).slice(0, length);
}

/** Stable identifier for a combination from its (already sorted) member points. */
function combinationIndex(sortedMembers: PubKey[]): string {
  const parts = sortedMembers.map((p) =>
    concatBytes(toBytesLE(p.x), toBytesLE(p.y))
  );
  return bytesToHex(sha256(concatBytes(...parts)));
}

/** All k-subsets of {0, ..., n-1} as ascending index arrays. */
function indexCombinations(n: number, k: number): number[][] {
  if (k > n || k < 0) return [];
  if (k === 0) return [[]];

  const combinations: number[][] = [];
  const path: number[] = new Array(k);

  const backtrack = (start: number, depth: number) => {
    if (depth === k) {
      combinations.push(path.slice());
      return;
    }
    for (let i = start; i <= n - (k - depth); i++) {
      path[depth] = i;
      backtrack(i + 1, depth + 1);
    }
  };

  backtrack(0, 0);
  return combinations;
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`xor length mismatch: ${a.length} vs ${b.length}`);
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}
