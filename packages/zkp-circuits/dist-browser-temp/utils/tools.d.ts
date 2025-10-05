declare const stringifyBigInts: (obj: object) => any;
declare const unstringifyBigInts: (obj: object) => any;
import { PrivKey, PubKey, Keypair, babyJub } from "./types";
import { BabyJubAffinePoint, BabyJubExtPoint } from "./types";
import { ExtPointType } from "@noble/curves/abstract/edwards";
export { babyJub };
export type { BabyJubAffinePoint, BabyJubExtPoint, PrivKey, PubKey, Keypair };
export declare function createNobleBlakeHash(data: Buffer): Buffer<ArrayBuffer>;
/**
 * Generate a random number of 125 bits.
 * @returns {BigInt} - A random 125-bit number.
 */
export declare function generateRandom248BitNumber(): bigint;
export declare function shrinkToBits(number: bigint, bits: number): bigint;
/**
 * Split a very large number into chunks of 32 bits each.
 * @param {BigInt} number - A BigInt representing the large number.
 * @returns {Array<BigInt>} - An array of chunks (BigInts).
 */
export declare function splitLargeNumber(number: bigint, size?: bigint): any[];
/**
 * Combine chunks of 32 bits each into the original large number.
 * @param {Array<BigInt>} chunks - An array of chunks (BigInts).
 * @param {BigInt} size - The size of each chunk in bits.
 * @returns {BigInt} - The combined large number.
 */
export declare function combineChunksWithCarry(chunks: bigint[], size?: bigint): bigint;
declare function pruneBuffer(buff: Buffer): Buffer<ArrayBufferLike>;
declare function stringToCurve(mimc: any, string: string): any;
declare function prv2pub(prv: Buffer): ExtPointType;
declare function ffEncodedToBigInt(babyJub: any, encoded: bigint): any;
/**
 * An internal function which formats a random private key to be compatible
 * with the BabyJub curve. This is the format which should be passed into the
 * PubKey and other circuits.
 */
declare function formatPrivKeyForBabyJub(privKey: bigint): any;
/**
 * Function to use when you have just the scalar value of the private key
 * and you need to convert it to the public key (Ax, Ay)
 */
declare function privateScalarToPubKey(p: bigint): [bigint, bigint];
/**
 * Convert a BigInt to a Buffer
 */
declare const bigInt2Buffer: (i: BigInt) => Buffer;
declare const hexString2Buffer: (i: string) => Buffer;
declare const buffer2HexString: (i: Buffer) => string;
declare const uint8ArrayToHex: (uint8Array: Uint8Array | any) => string;
/**
 * Convert an EC extended point into an array of two bigints
 */
declare function toBigIntArray(point: BabyJubExtPoint): [bigint, bigint];
/**
 * Convert an EC extended point into an array of two strings
 */
declare function toStringArray(point: BabyJubExtPoint): [string, string];
declare function combineTwoPublicKeys(pubKey1: bigint[], pubKey2: bigint[]): bigint[];
export declare function combineTwoPublicKeysPlain(pubKey1: bigint[], pubKey2: bigint[]): bigint[];
/**
 * Convert two strings x and y into an EC extended point
 */
declare function coordinatesToExtPoint(x: string, y: string): BabyJubExtPoint;
export declare const bufferToBigInt: (buf: Buffer | Uint8Array) => bigint;
export declare function coordinatesToExtPointBigint(x: bigint, y: bigint): BabyJubExtPoint;
/**
 * Returns a Uint8Array of cryptographically secure random bytes.
 * This function works in both browser and Node.js environments.
 * In browsers, it uses window.crypto.getRandomValues.
 * In Node.js, it uses require('crypto').randomBytes if available.
 * @param length Number of random bytes to generate.
 * @returns Uint8Array of random bytes.
 */
export declare function portableRandomBytes(length: number): Buffer;
export declare function HEEncryptFromPoint(message: bigint, pubKey: ExtPointType, exportNonces?: boolean): {
    ephemeral_keys: ExtPointType[];
    encrypted_messages: ExtPointType[];
    nonces: bigint[];
};
export declare function HEEncrypt(message: bigint, pubKey: bigint[], exportNonces?: boolean): {
    ephemeral_keys: ExtPointType[];
    encrypted_messages: ExtPointType[];
    nonces: bigint[];
};
export declare function HEDecrypt(privKey: bigint, cypherTexts: bigint[], ephemeralKeys: bigint[]): Promise<bigint>;
export declare function HEDecryptSync(privKey: bigint, cypherTexts: bigint[], ephemeralKeys: bigint[]): bigint;
export declare const hashCypherText: (message: bigint[], ephemeralKey: bigint[], relatedPublicKey: bigint[], preimage_hash: any, random_value: bigint, unseal_condition_root_hash: any, metadata_root_commit: any) => bigint;
declare function pruneTo64Bits(originalValue: bigint): bigint;
declare function pruneTo32Bits(bigInt253Bit: bigint): bigint;
/**
 * - Returns a signal value similar to the "callGetSignalByName" function from the "circom-helper" package.
 * - This function depends on the "circom_tester" package.
 *
 * Example usage:
 *
 * ```typescript
 * const wasm_tester = require('circom_tester').wasm;
 *
 * /// the circuit is loaded only once and it is available for use across multiple test cases.
 * const circuit = await wasm_tester(path.resolve("./circuit/path"));
 * const witness = await circuit.calculateWitness(inputsObject);
 * await circuit.checkConstraints(witness);
 * await circuit.loadSymbols();
 *
 * /// You can check signal names by printing "circuit.symbols".
 * /// You will mostly need circuit inputs and outputs.
 * const singalName = 'main.out'
 * const signalValue = getSignalByName(circuit, witness, SignalName)
 * ```
 */
declare const getSignalByName: (circuit: any, witness: any, signalName: string) => any;
/**
 * Encrypts a BigInt value using AES-256-CBC encryption
 * @param value - The BigInt value to encrypt
 * @param key - The encryption key as a BigInt
 * @returns The encrypted value as a hex string
 */
declare function encryptAESBigInt(value: bigint, key: bigint): string;
/**
 * Decrypts a hex string back to a BigInt value using AES-256-CBC decryption
 * @param encryptedHex - The encrypted value as a hex string
 * @param key - The decryption key as a BigInt
 * @returns The decrypted BigInt value
 */
declare function decryptAESBigInt(encryptedHex: string, key: bigint): bigint;
declare function encryptECCBabyJub(message: bigint, recipientPubKey: PubKey): {
    ciphertextHex: string;
    R: {
        x: string;
        y: string;
    };
};
declare function decryptECCBabyJub(ciphertextHex: string, RHex: {
    x: string;
    y: string;
}, recipientPrivKey: PrivKey): bigint;
/**
 * Returns a BabyJub-compatible random value. We create it by first generating
 * a random value (initially 256 bits large) modulo the snark field size as
 * described in EIP197. This results in a key size of roughly 253 bits and no
 * more than 254 bits. To prevent modulo bias, we then use this efficient
 * algorithm:
 * http://cvsweb.openbsd.org/cgi-bin/cvsweb/~checkout~/src/lib/libc/crypt/arc4random_uniform.c
 * @return A BabyJub-compatible random value.
 * @see {@link https://github.com/privacy-scaling-explorations/maci/blob/master/crypto/ts/index.ts}
 */
export declare function genRandomBabyJubValue(): bigint;
export declare function genSmallRandomBabyJubValue(): bigint;
/**
 * @return A BabyJub-compatible private key.
 */
export declare const genPrivKey: () => PrivKey;
/**
 * @return A BabyJub-compatible salt.
 */
export declare const genRandomSalt: () => PrivKey;
/**
 * @param privKey A private key generated using genPrivKey()
 * @return A public key associated with the private key
 */
export declare function genPubKey(privKey: PrivKey): PubKey;
export declare function genKeypair(scalar?: bigint): Keypair;
/**
 * Encrypts a plaintext such that only the owner of the specified public key
 * may decrypt it.
 * @param pubKey The recepient's public key
 * @param encodedMessage A plaintext encoded as a BabyJub curve point (optional)
 * @param randomVal A random value y used along with the private key to generate the ciphertext (optional)
 */
export declare function encrypt(pubKey: PubKey, encodedMessage: BabyJubExtPoint, randomVal?: bigint): {
    message: ExtPointType;
    ephemeral_key: ExtPointType;
    encrypted_message: ExtPointType;
    nonce: bigint;
};
/**
 * Decrypts a ciphertext using a private key.
 * @param privKey The private key
 * @param ciphertext The ciphertext to decrypt
 */
export declare function decrypt(privKey: PrivKey, ephemeral_key: BabyJubExtPoint, encrypted_message: BabyJubExtPoint): BabyJubExtPoint;
export declare function encrypt_s(message: BabyJubExtPoint, public_key: PubKey, nonce?: bigint): {
    ephemeral_key: ExtPointType;
    encrypted_message: ExtPointType;
};
export { stringToCurve, combineTwoPublicKeys, uint8ArrayToHex, pruneBuffer, privateScalarToPubKey, prv2pub, bigInt2Buffer, hexString2Buffer, buffer2HexString, getSignalByName, stringifyBigInts, unstringifyBigInts, toStringArray, toBigIntArray, formatPrivKeyForBabyJub, coordinatesToExtPoint, pruneTo64Bits, pruneTo32Bits, ffEncodedToBigInt, encryptAESBigInt, decryptAESBigInt, encryptECCBabyJub, decryptECCBabyJub };
