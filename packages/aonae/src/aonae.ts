import { sha256 } from "@noble/hashes/sha256";
import { generateKeypair, ecdh, getBJJ, bufToBigInt, bigIntToBuf } from "./bjj-ecdh.js";
import { deriveKey, generateSalt, DEFAULT_ARGON2_PARAMS } from "./kdf.js";
import { aontEncode, aontDecode } from "./aont.js";
import { encrypt, decrypt } from "./aes-gcm.js";
import { serializePayload, deserializePayload } from "./payload.js";
import { randomBytes } from "./crypto-env.js";
import type {
  BJJPoint,
  AONAEPayload,
  AONAECiphertext,
  ProcessorPayload,
  Argon2Params,
  SignalCommitment,
} from "./types.js";

export interface SealResult {
  /** The AONAE ciphertext — stored in the private sealed package. */
  ciphertext: AONAECiphertext;
  /** Signal commitment — stored in the public observer package. */
  signalCommitment: SignalCommitment;
}

/**
 * AONAE Seal — Client side.
 *
 * Encrypts content along with peer payloads and a signal token into
 * an indivisible ciphertext. The ephemeral private key is destroyed;
 * recovery requires the sealed key pkF via the normal unsealing protocol.
 *
 * @param content       The data to seal.
 * @param peerPayloads  Complete processor payloads for all OTHER processors
 *                      in the threshold set.
 * @param pkF           The sealed public key from §5.2.
 * @param processorId   Identifier for the target processor (for the signal commitment).
 * @param argon2Params  Optional override for Argon2id parameters.
 */
export async function seal(
  content: Uint8Array,
  peerPayloads: ProcessorPayload[],
  pkF: BJJPoint,
  processorId: string,
  argon2Params: Argon2Params = DEFAULT_ARGON2_PARAMS
): Promise<SealResult> {
  // 1. Generate ephemeral keypair
  const ephemeral = await generateKeypair();

  // 2. ECDH shared secret
  const sharedSecret = await ecdh(ephemeral.privateKey, pkF);

  // 3. Argon2id key derivation
  const salt = generateSalt();
  const kAon = await deriveKey(sharedSecret, salt, argon2Params);

  // 4. Generate signal token
  const signal = randomBytes(32);
  const signalHash = sha256(signal);

  // 5. Construct and serialize payload
  const payload: AONAEPayload = {
    content,
    peerPayloads,
    signal,
    nonce: randomBytes(32),
  };
  const serialized = serializePayload(payload);

  // 6. Apply AONT
  const aontEncoded = await aontEncode(serialized);

  // 7. AES-GCM encrypt
  const { ciphertext, iv } = await encrypt(kAon, aontEncoded);

  // 8. Destroy ephemeral private key and intermediate key material
  ephemeral.privateKey.fill(0);
  sharedSecret.fill(0);
  kAon.fill(0);

  return {
    ciphertext: {
      ciphertext,
      iv,
      authTag: ciphertext.slice(ciphertext.length - 16), // GCM tag is last 16 bytes
      publicKey: ephemeral.publicKey,
      argon2Params,
      salt,
    },
    signalCommitment: {
      processorId,
      commitment: signalHash,
    },
  };
}

/**
 * AONAE Unseal — Client side (normal flow).
 *
 * After recovering KF through the standard unsealing protocol (§6),
 * the client uses it to derive the ECDH shared secret and decrypt.
 *
 * @param sealed  The AONAE ciphertext from the private package.
 * @param kF      The recovered private key (KF = K1 + K2).
 */
export async function unseal(
  sealed: AONAECiphertext,
  kF: Uint8Array
): Promise<AONAEPayload> {
  // 1. Recompute ECDH shared secret: KF · pk_e
  const sharedSecret = await ecdh(kF, sealed.publicKey);

  // 2. Re-derive K_aon
  const kAon = await deriveKey(sharedSecret, sealed.salt, sealed.argon2Params);

  // 3. AES-GCM decrypt (throws on auth failure = tampered ciphertext)
  // sealed.iv is Uint8Array (user-supplied) — safe to cast since we never produce SharedArrayBuffer
  const aontEncoded = await decrypt(kAon, sealed.ciphertext, sealed.iv as Uint8Array<ArrayBuffer>);

  // 4. Invert AONT
  const serialized = await aontDecode(aontEncoded);

  // 5. Deserialize payload
  const payload = deserializePayload(serialized);

  // Cleanup
  sharedSecret.fill(0);
  kAon.fill(0);

  return payload;
}

/**
 * AONAE Unseal — Processor side (out-of-protocol flow).
 *
 * A processor that has been given K2 (client's key component)
 * and the full AONAE ciphertext. The processor uses its own K1
 * to reconstruct KF and decrypt.
 *
 * @param sealed  The AONAE ciphertext.
 * @param k1      The processor's private key component.
 * @param k2      The client's private key component (provided by requestor).
 */
export async function unsealAsProcessor(
  sealed: AONAECiphertext,
  k1: Uint8Array,
  k2: Uint8Array
): Promise<{
  payload: AONAEPayload;
  signal: Uint8Array;
  peerPayloads: ProcessorPayload[];
}> {
  // Reconstruct KF = K1 + K2 (scalar addition mod subgroup order)
  const bjj = await getBJJ();

  const k1Scalar = bufToBigInt(k1);
  const k2Scalar = bufToBigInt(k2);
  const kfScalar = (k1Scalar + k2Scalar) % bjj.subOrder;
  const kF = bigIntToBuf(kfScalar, 32);

  // Decrypt using the combined key
  const payload = await unseal(sealed, kF);

  // Cleanup
  kF.fill(0);

  // Processor now has full visibility.
  return {
    payload,
    signal: payload.signal,
    peerPayloads: payload.peerPayloads,
  };
}
