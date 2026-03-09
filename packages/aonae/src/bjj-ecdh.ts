import { buildBabyjub } from "circomlibjs";
import { randomBytes } from "./crypto-env.js";
import type { BJJKeypair, BJJPoint } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _bjj: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBJJ(): Promise<any> {
  if (!_bjj) {
    _bjj = await buildBabyjub();
  }
  return _bjj;
}

/**
 * Generate a Baby Jubjub keypair.
 * Private key is a random scalar mod subgroup order.
 * Public key coordinates are returned as plain bigints (via F.toObject).
 */
export async function generateKeypair(): Promise<BJJKeypair> {
  const bjj = await getBJJ();
  const privateKey = randomBytes(32);

  // Reduce mod subgroup order to get valid scalar
  const scalar = bufToBigInt(privateKey) % bjj.subOrder;
  const privBytes = bigIntToBuf(scalar, 32);

  // mulPointEscalar returns F elements (Montgomery form). Convert to plain bigints.
  const rawPk = bjj.mulPointEscalar(bjj.Base8, scalar);
  const publicKey: BJJPoint = [
    bjj.F.toObject(rawPk[0]) as bigint,
    bjj.F.toObject(rawPk[1]) as bigint,
  ];

  return { privateKey: privBytes, publicKey };
}

/**
 * Compute ECDH shared secret: scalar · point.
 * Accepts BJJPoint (bigint coordinates) and converts internally to F elements.
 * Returns the x-coordinate of the resulting point, serialized to 32 bytes.
 */
export async function ecdh(
  privateKey: Uint8Array,
  publicKey: BJJPoint
): Promise<Uint8Array> {
  const bjj = await getBJJ();
  const scalar = bufToBigInt(privateKey);

  // Convert bigint coordinates back to F elements for mulPointEscalar
  const pkF = [bjj.F.e(publicKey[0]), bjj.F.e(publicKey[1])];
  const shared = bjj.mulPointEscalar(pkF, scalar);

  // Use x-coordinate as shared secret (standard for ECDH on twisted Edwards)
  return bigIntToBuf(bjj.F.toObject(shared[0]) as bigint, 32);
}

export function bufToBigInt(buf: Uint8Array): bigint {
  let result = 0n;
  for (let i = buf.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(buf[i]);
  }
  return result;
}

export function bigIntToBuf(n: bigint, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  let val = n;
  for (let i = 0; i < len; i++) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return buf;
}
