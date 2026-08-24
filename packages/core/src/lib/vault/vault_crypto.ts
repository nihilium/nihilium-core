import { cryptoTools } from "@nihilium/zkp-circuits";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";
import { HexString, VaultEncryptedBlob, VaultPublicKey } from "../../types/protocol/common";
import { toPaddedHex } from "../utils";

// The seal carries these, so they are declared with the other protocol types.
export type { VaultPublicKey, VaultEncryptedBlob };

/** The only blob format this module produces; the tag exists so a future scheme can be told apart. */
export const VAULT_BLOB_ALG = "ECIES-BJJ-AES256GCM" as const;

/**
 * A fresh vault keypair. The scalar is used raw — `pk = sk · G` — rather than through `genKeypair()`,
 * whose blake2b-prune derivation would leave `pk != sk · G` and break every ECIES decryption in a way
 * that only shows up as garbage plaintext. This matches how the threshold construction builds its own
 * keys (see dte_hard's vault key).
 */
export function generateVaultKeypair(): { privateKey: bigint; publicKey: VaultPublicKey } {
    const privateKey = cryptoTools.generateRandom240BitNumber();
    return { privateKey, publicKey: vaultPublicKeyFor(privateKey) };
}

/** The public key of a vault private scalar; also the way to check a seal's key matches a recovery. */
export function vaultPublicKeyFor(privateKey: bigint): VaultPublicKey {
    const [x, y] = cryptoTools.privateScalarToPubKey(privateKey);
    return { x: toPaddedHex(BigInt(x)), y: toPaddedHex(BigInt(y)) };
}

/**
 * Encrypt data to a vault, needing nothing but its public key — no unseal, no processors, no network.
 * That is the point of publishing the key: data can be added to a vault long after it was sealed.
 *
 * ECIES over BabyJubJub: a fresh ephemeral keypair per blob, an AES-256-GCM key derived from the
 * Diffie-Hellman shared secret, and the ephemeral public key stored alongside the ciphertext. The KDF
 * matches the convention already used by encryptECCBabyJub — sha256 over the little-endian shared
 * point — but the payload is AES-GCM rather than a 32-byte one-time pad, so it takes data of any
 * length and carries an authentication tag.
 */
export async function encryptForVault(
    publicKey: VaultPublicKey,
    data: Uint8Array | string,
): Promise<VaultEncryptedBlob> {
    const plaintext = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const ephemeralScalar = cryptoTools.generateRandom240BitNumber();
    const sharedPoint = pointFrom(publicKey).multiply(ephemeralScalar);

    const iv = randomBytes(12);
    const key = await importAesKey(sharedSecretKeyBytes(sharedPoint));
    const ciphertext = new Uint8Array(await subtle().encrypt(
        { name: "AES-GCM", iv }, key, plaintext as unknown as ArrayBufferView as any,
    ));

    return {
        alg: VAULT_BLOB_ALG,
        R: vaultPublicKeyFor(ephemeralScalar),
        iv: "0x" + bytesToHex(iv),
        ciphertext: "0x" + bytesToHex(ciphertext),
    };
}

/**
 * Decrypt a blob with the vault private key recovered by unsealing. Throws if the key is wrong or the
 * blob was tampered with — AES-GCM authenticates, so this fails loudly instead of returning garbage.
 */
export async function decryptFromVault(
    privateKey: bigint,
    blob: VaultEncryptedBlob,
): Promise<Uint8Array> {
    if (blob.alg !== VAULT_BLOB_ALG) {
        throw new Error(`Unsupported vault blob algorithm "${blob.alg}"`);
    }
    const sharedPoint = pointFrom(blob.R).multiply(privateKey);
    const key = await importAesKey(sharedSecretKeyBytes(sharedPoint));
    try {
        const plaintext = await subtle().decrypt(
            { name: "AES-GCM", iv: fromHex(blob.iv) }, key, fromHex(blob.ciphertext) as any,
        );
        return new Uint8Array(plaintext);
    } catch {
        throw new Error(
            "Vault decryption failed: the blob does not belong to this vault key, or it was modified",
        );
    }
}

/** decryptFromVault for data that was encrypted from a string. */
export async function decryptFromVaultToString(
    privateKey: bigint,
    blob: VaultEncryptedBlob,
): Promise<string> {
    return new TextDecoder().decode(await decryptFromVault(privateKey, blob));
}

// --- internals ---------------------------------------------------------------------------------

function pointFrom(key: VaultPublicKey) {
    return cryptoTools.coordinatesToExtPointBigint(BigInt(key.x), BigInt(key.y));
}

/** sha256 over the little-endian shared point — the same KDF encryptECCBabyJub uses. */
function sharedSecretKeyBytes(sharedPoint: { x: bigint; y: bigint }): Uint8Array {
    return sha256(concatBytes(cryptoTools.toBytesLE(sharedPoint.x), cryptoTools.toBytesLE(sharedPoint.y)));
}

function subtle(): SubtleCrypto {
    const webcrypto = (globalThis as any).crypto;
    if (!webcrypto?.subtle) {
        throw new Error("Vault encryption needs WebCrypto (browser, or Node 18+)");
    }
    return webcrypto.subtle;
}

function randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    (globalThis as any).crypto.getRandomValues(out);
    return out;
}

function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return subtle().importKey("raw", keyBytes as any, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function fromHex(value: HexString): Uint8Array {
    return hexToBytes(value.startsWith("0x") ? value.slice(2) : value);
}
