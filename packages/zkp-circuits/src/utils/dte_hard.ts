import {
    BabyJubAffinePoint,
    BabyJubExtPoint,
    SNARK_FIELD_SIZE,
    babyJub,
  } from "./types";
  import { PubKey, PrivKey } from "./types";
  import { decode16, encode } from "./decode";
  import {
    encrypt,
    decrypt,
    formatPrivKeyForBabyJub,
    genRandomSalt,
    generateRandom248BitNumber,
    encryptECCBabyJub,
    portableArgon2,
    toBytesLE,
    fromBytesLE,
    decryptECCBabyJub,
    genPubKey,
    bigInt2Buffer,
    bufferToBigInt,
  } from "./tools";
  import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";
  import { sha256 } from "@noble/hashes/sha256";
// import { estimateRounds } from "./dte_difficulty";
  
  /*
  Full-Disclosure Threshold Encryption AKA Combinatorial Threshold Encryption
  
  Multi-Round Concatenation Variant
  ==================================
  Instead of combining public keys via EC addition and performing a single ECDH per
  combination, this variant performs individual ECDH per key per round and derives the
  symmetric key from the concatenation of all individual shared secrets.
  
  This forces any MPC-based collusion attempt to compute k × rounds separate EC scalar
  multiplications on secret-shared inputs inside the MPC circuit. Each EC scalar
  multiplication costs ~700M-1B AND gates in garbled circuits. At rounds=3, k=5 this
  means ~15 EC mults inside MPC → ~192 GB of communication between colluders.
  
  If the MPC outputs individual shared secrets instead of the final hash, each is a
  DLEQ-attributable partial decryption → slashable.
  
  Cost to legitimate user:
    Sealing:   rounds × k × C(n,k) EC mults (parallelizable, one-time)
    Unsealing:  rounds × k EC mults (instant)
  
  Parameters:
    rounds=1:  equivalent security to original (but with DLEQ attribution benefit)
    rounds=3:  recommended default (~192 GB MPC communication for k=5)
    rounds=10: high security (~640 GB MPC communication for k=5)
  */
  
  
  export interface FDTSealedPackage {
    cipherTexts: { [key: string]: string };
    ephemeralKeys: { x: string; y: string }[];
    rounds: number;
  }
  
  export function FDTEncrypt(
    message: bigint,
    pubKeys: PubKey[],
    threshold: number,
    
  ): FDTSealedPackage {
   
    var rounds = 1;
    
    if (threshold > pubKeys.length) {
      throw new Error("Threshold is greater than the number of public keys");
    }
    if (threshold < 1) {
      throw new Error("Threshold is less than 1");
    }
    if (rounds < 1) {
      throw new Error("Rounds must be at least 1");
    }
  
    console.time("FDTEncrypt");
  
    // Generate multiple ephemeral scalars and curve points (one per round)
    console.time("generateEphemeralKeys");
    const nonces: bigint[] = [];
    const ephemeralPoints: BabyJubExtPoint[] = [];
    const ephemeralKeys: { x: string; y: string }[] = [];
  
    for (let i = 0; i < rounds; i++) {
      const r = generateRandom248BitNumber();
      nonces.push(r);
      const C = babyJub.BASE.multiply(r);
      ephemeralPoints.push(C);
      ephemeralKeys.push({
        x: bytesToHex(toBytesLE(C.x)),
        y: bytesToHex(toBytesLE(C.y)),
      });
    }
    console.timeEnd("generateEphemeralKeys");
  
    // Generate all threshold-qualifying combinations
    console.time("generateCombinations");
    const combinations = generateCombinations(pubKeys, threshold);
    console.timeEnd("generateCombinations");
  
    console.time("encryptCombinations");
    const ciphertextMap: { [key: string]: string } = {};
    const msgBytes = bigInt2Buffer(message);
  
    combinations.forEach((combination) => {
      // Sort combination canonically so encrypt and decrypt use identical ordering
      const sorted = [...combination].sort((a, b) =>
        a.toHex().localeCompare(b.toHex())
      );
  
      // Combined public key is still used for ciphertext lookup indexing
      // (addition is commutative so sorting doesn't affect the sum)
      const combinedPubKey = combinePublicKeys(sorted);
  
      // Build concatenation of individual ECDH shared secrets across all rounds:
      // KDF( r1·pk_i || r1·pk_j || ... || r2·pk_i || r2·pk_j || ... )
      const sharedSecretParts: Uint8Array[] = [];
  
      for (let round = 0; round < rounds; round++) {
        for (const pubKey of sorted) {
          const S = pubKey.multiply(nonces[round]); // r_round · pkF_i
          sharedSecretParts.push(toBytesLE(S.x));
          sharedSecretParts.push(toBytesLE(S.y));
        }
      }
  
      // KDF over full concatenation → symmetric key
      const concatenated = concatBytes(...sharedSecretParts);
      //const key = portableArgon2(Buffer.from(concatenated), default_parameters).slice(0, msgBytes.length);
      const key = sha256(concatenated).slice(0, msgBytes.length);
      const ciphertext = xor(msgBytes, key);
  
      // Index by combined pubkey prefix (same as original for compatibility)
      const index = combinedPubKey.toHex().substring(0, 8);
      if (!ciphertextMap[index]) {
        ciphertextMap[index] = bytesToHex(ciphertext);
      } else {
        ciphertextMap[combinedPubKey.toHex()] = bytesToHex(ciphertext);
      }
    });
  
    console.timeEnd("encryptCombinations");
    console.timeEnd("FDTEncrypt");
  
    return {
      cipherTexts: ciphertextMap,
      ephemeralKeys,
      rounds,
    };
  }
  
  export function FDTDecrypt(
    privateKeys: PrivKey[],
    ciphertextMap: { [key: string]: string },
    ephemeralKeys: { x: string; y: string }[]
  ): string {
    console.time("FDTDecrypt");
  
    const rounds = ephemeralKeys.length;
  
    // Derive public keys from private keys and sort canonically
    // This must match the sort order used during encryption
    const keyPairs = privateKeys
      .map((sk) => ({
        sk,
        pk: babyJub.BASE.multiply(sk),
      }))
      .sort((a, b) => a.pk.toHex().localeCompare(b.pk.toHex()));
  
    // Combined key for ciphertext lookup (addition is commutative)
    const combinedPrivateKey = keyPairs.reduce((acc, kp) => acc + kp.sk, 0n);
    const combinedPubKey = babyJub.BASE.multiply(combinedPrivateKey);
  
    const subkey = combinedPubKey.toHex().substring(0, 8);
    let ciphertext = ciphertextMap[subkey];
    if (!ciphertext) {
      ciphertext = ciphertextMap[combinedPubKey.toHex()];
    }
    if (!ciphertext) {
      throw new Error("Ciphertext not found for this key combination");
    }
  
    // Reconstruct ephemeral curve points from serialized form
    const ephemeralPoints: BabyJubExtPoint[] = ephemeralKeys.map((ek) => {
      const x = fromBytesLE(hexToBytes(ek.x));
      const y = fromBytesLE(hexToBytes(ek.y));
      return babyJub.fromAffine({ x, y });
    });
  
    // Compute individual ECDH shared secrets: sk_i · C_round for each key × round
    // Must follow same ordering as encryption: rounds outer, sorted keys inner
    console.time("computeSharedSecrets");
    const sharedSecretParts: Uint8Array[] = [];
  
    for (let round = 0; round < rounds; round++) {
      for (const { sk } of keyPairs) {
        const S = ephemeralPoints[round].multiply(sk); // sk_i · C_round
        sharedSecretParts.push(toBytesLE(S.x));
        sharedSecretParts.push(toBytesLE(S.y));
      }
    }
    console.timeEnd("computeSharedSecrets");
  
    // KDF over full concatenation → symmetric key
    const concatenated = concatBytes(...sharedSecretParts);
    const ciphertextBytes = hexToBytes(ciphertext);
    //const key = portableArgon2(Buffer.from(concatenated), default_parameters).slice(0, ciphertextBytes.length);
    const key = sha256(concatenated).slice(0, ciphertextBytes.length);
    const decrypted = xor(ciphertextBytes, key);
  
    console.timeEnd("FDTDecrypt");
    return bufferToBigInt(decrypted).toString();
  }
  
  // --- Helpers ---
  
  function combinePublicKeys(pubKeys: PubKey[]): BabyJubExtPoint {
    let combined = pubKeys[0];
    for (let i = 1; i < pubKeys.length; i++) {
      combined = combined.add(pubKeys[i]);
    }
    return combined;
  }
  
  function generateCombinations(pubKeys: PubKey[], threshold: number): PubKey[][] {
    const n = pubKeys.length;
    const k = threshold;
  
    if (k > n) return [];
    if (k === 1) return pubKeys.map((pk) => [pk]);
    if (k === 0) return [[]];
  
    const combinations: PubKey[][] = [];
    const path: PubKey[] = new Array(k);
  
    const backtrack = (startIndex: number, depth: number) => {
      if (depth === k) {
        combinations.push(path.slice());
        return;
      }
      for (let i = startIndex; i <= n - (k - depth); i++) {
        path[depth] = pubKeys[i];
        backtrack(i + 1, depth + 1);
      }
    };
  
    backtrack(0, 0);
    return combinations;
  }
  
  function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }