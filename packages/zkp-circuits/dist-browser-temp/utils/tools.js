// import { createHash } from "crypto";
// //import { randomBytes } from "crypto";
// import { blake512 } from "@noble/hashes/blake1";
// import { createCipheriv, createDecipheriv } from "crypto";
// function createBlakeHash(algorithm:string) {
//     if (algorithm !== "blake512") {
//         throw new Error("Unsupported algorithm");
//     }
//     //return blake512;
//     return createHash("blake2b512");
// }
import * as ff from "ffjavascript";
import { argon2d } from '@noble/hashes/argon2';
//const ff = require("ffjavascript");
const stringifyBigInts = ff.utils.stringifyBigInts;
const unstringifyBigInts = ff.utils.unstringifyBigInts;
import { Scalar } from "ffjavascript";
import { babyJubNoble as CURVE, babyJub } from "./types";
import { SNARK_FIELD_SIZE } from "./types";
// import * as ec from "../ecelgamal";
import { decode, encode } from "./decode";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha2";
import * as zkJub from "@zk-kit/baby-jubjub";
import { blake2b } from "@noble/hashes/blake2b";
import { poseidon16, poseidon8 } from "poseidon-lite";
export * as poseidonTools from "poseidon-lite";
import CryptoJS from "crypto-js";
export { babyJub, SNARK_FIELD_SIZE };
var aaa = CURVE;
const CHUNK_SIZE = 31n; // Each chunk is 31 bits allowing for a 32 bit carry when combining chunks
const CHUNK_MASK = (1n << CHUNK_SIZE) - 1n; // Mask for 32 bits: 0xFFFFFFFF
export function createNobleBlakeHash(data) {
    return Buffer.from(blake2b(data, { dkLen: 32 }).slice(0, 32));
}
export function generateRandom248BitNumber() {
    const randomBytesBuffer = portableRandomBytes(31); // 31 bytes = 248 bits
    // randomBytesBuffer[0] &= 0x1F; // Mask the first 3 bits to ensure the number is 125 bits
    return BigInt('0x' + randomBytesBuffer.toString('hex').padStart(62, '0'));
}
export function generateRandom240BitNumber() {
    const randomBytesBuffer = portableRandomBytes(30); // 30 bytes = 240 bits
    // randomBytesBuffer[0] &= 0x1F; // Mask the first 3 bits to ensure the number is 125 bits
    return BigInt('0x' + randomBytesBuffer.toString('hex').padStart(60, '0'));
}
export function shrinkToBits(number, bits) {
    return number & ((1n << BigInt(bits)) - 1n);
}
/**
 * Split a very large number into chunks of 32 bits each.
 * @param {BigInt} number - A BigInt representing the large number.
 * @returns {Array<BigInt>} - An array of chunks (BigInts).
 */
export function splitLargeNumber(number, size = CHUNK_SIZE) {
    const chunks = [];
    var cloned = 0n + number;
    while (cloned > 0n) {
        chunks.push(cloned & CHUNK_MASK); // Extract the lower 32 bits using CHUNK_MASK
        cloned >>= size; // Shift right by the specified chunk size
    }
    if (chunks.length === 0) {
        chunks.push(0n); // Ensure at least one chunk is returned
    }
    return chunks;
}
/**
 * Combine chunks of 32 bits each into the original large number.
 * @param {Array<BigInt>} chunks - An array of chunks (BigInts).
 * @param {BigInt} size - The size of each chunk in bits.
 * @returns {BigInt} - The combined large number.
 */
export function combineChunksWithCarry(chunks, size = CHUNK_SIZE) {
    let combined = 0n;
    let carry = 0n;
    const mask = (1n << size) - 1n; // Mask for the specified chunk size
    for (let i = 0; i < chunks.length; i++) {
        let chunkWithCarry = chunks[i] + carry; // Add carry to the current chunk
        carry = chunkWithCarry >> size; // Extract carry (upper bits)
        chunkWithCarry &= mask; // Keep only the lower bits as per the chunk size
        combined += chunkWithCarry << (BigInt(i) * size); // Add chunk to result
    }
    // If there's still a carry left, append it as a new chunk
    if (carry > 0n) {
        combined += carry << (BigInt(chunks.length) * size);
    }
    return combined;
}
// Taken from https://github.com/iden3/circomlibjs/blob/main/src/eddsa.js
function pruneBuffer(buff) {
    buff[0] = buff[0] & 0xf8;
    buff[31] = buff[31] & 0x7f;
    buff[31] = buff[31] | 0x40;
    return buff;
}
function stringToCurve(mimc, string) {
    var aaa = mimc.F.fromObject(BigInt(string));
    var bbb = mimc.F.toObject(aaa);
    return bbb;
}
// Taken from https://github.com/iden3/circomlibjs/blob/main/src/eddsa.js
function prv2pub(prv) {
    const sBuff = pruneBuffer(createNobleBlakeHash(prv));
    let s = Scalar.fromRprLE(sBuff, 0, 32);
    //const base8 = babyJub.BASE.multiply(8n);
    // var result = bigInt2Buffer(toBigIntArray(babyJub.BASE.add(babyJub.BASE))[0])
    // const thebase = toBigIntArray(babyJub.BASE)
    // const base_xy = toBigIntArray(base8);
    // const scalr= Scalar.shr(s, 3)
    const A = babyJub.BASE.multiply(BigInt(Scalar.shr(s, 3)));
    //const A_xy = bigInt2Buffer(toBigIntArray(A)[0]);
    return A;
}
function ffEncodedToBigInt(babyJub, encoded) {
    var asfs = babyJub.F.fromObject(encoded);
    return babyJub.F.e(ff.utils.leBuff2int(asfs));
}
/**
 * An internal function which formats a random private key to be compatible
 * with the BabyJub curve. This is the format which should be passed into the
 * PubKey and other circuits.
 */
function formatPrivKeyForBabyJub(privKey) {
    const sBuff = pruneBuffer(createNobleBlakeHash(bigInt2Buffer(privKey)).slice(0, 32));
    const s = ff.utils.leBuff2int(sBuff);
    return ff.Scalar.shr(s, 3);
}
/**
 * Function to use when you have just the scalar value of the private key
 * and you need to convert it to the public key (Ax, Ay)
 */
function privateScalarToPubKey(p) {
    const A = babyJub.BASE.multiply(p);
    return toBigIntArray(A);
}
/**
 * Convert a BigInt to a Buffer
 */
const bigInt2Buffer = (i) => {
    var hex = i.toString(16);
    if (hex.length % 2 == 1) {
        hex = "0" + hex;
    }
    return Buffer.from(hex, "hex");
};
const hexString2Buffer = (i) => {
    return Buffer.from(i, "hex");
};
const buffer2HexString = (i) => {
    return i.toString('hex');
};
const uint8ArrayToHex = (uint8Array) => {
    // Handle null/undefined
    if (!uint8Array) {
        return '0x';
    }
    // Handle both actual Uint8Array and array-like objects
    let array;
    if (uint8Array instanceof Uint8Array) {
        array = Array.from(uint8Array);
    }
    else if (Array.isArray(uint8Array)) {
        array = uint8Array;
    }
    else if (typeof uint8Array[Symbol.iterator] === 'function') {
        array = [...uint8Array];
    }
    else {
        // Fallback: try to convert to array manually
        array = Array.from(uint8Array);
    }
    return array.map(b => b.toString(16).padStart(2, '0')).join('');
};
/**
 * Convert an EC extended point into an array of two bigints
 */
function toBigIntArray(point) {
    const point_affine = point.toAffine();
    const x = point_affine.x;
    const y = point_affine.y;
    return [x, y];
}
/**
 * Convert an EC extended point into an array of two strings
 */
function toStringArray(point) {
    const point_affine = point.toAffine();
    const x = point_affine.x.toString();
    const y = point_affine.y.toString();
    return [x, y];
}
function combineTwoPublicKeys(pubKey1, pubKey2) {
    const point1 = coordinatesToExtPointBigint(pubKey1[0], pubKey1[1]);
    const point2 = coordinatesToExtPointBigint(pubKey2[0], pubKey2[1]);
    const point3 = point1.add(point2);
    return toBigIntArray(point3);
}
export function combineTwoPublicKeysPlain(pubKey1, pubKey2) {
    const point1 = zkJub.addPoint(pubKey1, pubKey2);
    return point1;
}
/**
 * Convert two strings x and y into an EC extended point
 */
function coordinatesToExtPoint(x, y) {
    const x_bigint = BigInt(x);
    const y_bigint = BigInt(y);
    const affine_point = { x: x_bigint, y: y_bigint };
    return babyJub.fromAffine(affine_point);
}
export const bufferToBigInt = (buf) => BigInt('0x' + Buffer.from(buf).toString('hex'));
export function coordinatesToExtPointBigint(x, y) {
    const affine_point = { x: x, y: y };
    return babyJub.fromAffine(affine_point);
}
var defaultOptions = { memory: 64 * 1024, iterations: 3, parallelism: 4 };
export function portableArgon2(data, options = defaultOptions) {
    const params = {
        t: options.iterations, // iterations (time cost)
        m: options.memory, // memory cost in KiB (~64 MiB)
        p: options.parallelism, // parallelism
        maxmem: 2 ** 28 - 1, // safety limit (~256 MB)
    };
    return Buffer.from(argon2d(data, Buffer.from(data), params).slice(0, data.length));
}
/**
 * Returns a Uint8Array of cryptographically secure random bytes.
 * This function works in both browser and Node.js environments.
 * In browsers, it uses window.crypto.getRandomValues.
 * In Node.js, it uses require('crypto').randomBytes if available.
 * @param length Number of random bytes to generate.
 * @returns Uint8Array of random bytes.
 */
export function portableRandomBytes(length) {
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
        // Browser environment
        const arr = new Uint8Array(length);
        window.crypto.getRandomValues(arr);
        return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    }
    else if (typeof global !== "undefined" && typeof require === "function") {
        // Node.js environment
        try {
            // Dynamically require to avoid bundler issues
            const nodeCrypto = require("crypto");
            return nodeCrypto.randomBytes(length);
        }
        catch (e) {
            throw new Error("Secure random number generation is not available.");
        }
    }
    else {
        throw new Error("Secure random number generation is not available in this environment.");
    }
}
export function generateNonces() {
    return [generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber(), generateRandom248BitNumber()];
}
export function HEEncryptFromPoint(message, pubKey, nonces = [], exportNonces = false) {
    var noncesToUse = nonces;
    if (nonces.length > 0) {
        noncesToUse = nonces;
    }
    else {
        noncesToUse = generateNonces();
    }
    var splitValueToEncrypt = splitLargeNumber(message);
    var encryptedCyphertexts = splitValueToEncrypt.map((value, i) => encrypt(pubKey, encode(babyJub.BASE, value), noncesToUse[i]));
    var encryptedCyphertextsMessages = encryptedCyphertexts.map(value => value.encrypted_message);
    var encryptedCyphertextsEphemeralKeys = encryptedCyphertexts.map(value => value.ephemeral_key);
    // var nonces = encryptedCyphertexts.map(value => value.nonce)
    return {
        ephemeral_keys: encryptedCyphertextsEphemeralKeys,
        encrypted_messages: encryptedCyphertextsMessages,
        nonces: exportNonces ? noncesToUse : []
    };
}
export function SimpelElgamalEncrypt(message, pubKey, bitSize = 16) {
    if (message.toString(2).length <= bitSize) {
        throw new Error("Message is too large to encrypt");
    }
    var nonce = generateRandom248BitNumber();
    var encrypted = encrypt(pubKey, encode(babyJub.BASE, message), nonce);
    var encrypted_message = encrypted.encrypted_message.toHex();
    var ephemeral_key = encrypted.ephemeral_key.toHex();
    return { ephemeral_key: ephemeral_key, encrypted_message: encrypted_message };
}
export function SimpelElgamalDecrypt(encrypted_message, ephemeral_key, privKey) {
    var encrypted_message_point = babyJub.fromHex(encrypted_message);
    var ephemeral_key_point = babyJub.fromHex(ephemeral_key);
    var decrypted = decrypt(privKey, ephemeral_key_point, encrypted_message_point);
    return decode(babyJub.BASE, decrypted, 16);
}
export function HEEncrypt(message, pubKey, nonces = [], exportNonces = false) {
    return HEEncryptFromPoint(message, coordinatesToExtPointBigint(pubKey[0], pubKey[1]), nonces, exportNonces);
}
// Optimized HEDecrypt with parallel processing
export async function HEDecryptExternalSolver(privKey, cypherTexts, ephemeralKeys, solve) {
    const numChunks = cypherTexts.length / 2;
    // Parallel coordinate conversion
    const [cypherTextsEncoded, empheralKeysEncoded] = await Promise.all([
        Promise.all(Array.from({ length: numChunks }, (_, i) => Promise.resolve(coordinatesToExtPointBigint(cypherTexts[i * 2], cypherTexts[(i * 2) + 1])))),
        Promise.all(Array.from({ length: numChunks }, (_, i) => Promise.resolve(coordinatesToExtPointBigint(ephemeralKeys[i * 2], ephemeralKeys[(i * 2) + 1]))))
    ]);
    // Parallel decryption and decode operations
    const decrypted_p = await Promise.all(cypherTextsEncoded.map(async (ciphertext, i) => {
        const decrypted = decrypt(privKey, empheralKeysEncoded[i], ciphertext);
        var [base_x, base_y] = toBigIntArray(babyJub.BASE);
        var [encoded_x, encoded_y] = toBigIntArray(decrypted);
        return solve(base_x, base_y, encoded_x, encoded_y);
    }));
    return combineChunksWithCarry(decrypted_p);
}
// Optimized HEDecrypt with parallel processing
export async function HEDecrypt(privKey, cypherTexts, ephemeralKeys) {
    const numChunks = cypherTexts.length / 2;
    // Parallel coordinate conversion
    const [cypherTextsEncoded, empheralKeysEncoded] = await Promise.all([
        Promise.all(Array.from({ length: numChunks }, (_, i) => Promise.resolve(coordinatesToExtPointBigint(cypherTexts[i * 2], cypherTexts[(i * 2) + 1])))),
        Promise.all(Array.from({ length: numChunks }, (_, i) => Promise.resolve(coordinatesToExtPointBigint(ephemeralKeys[i * 2], ephemeralKeys[(i * 2) + 1]))))
    ]);
    // Parallel decryption and decode operations
    const decrypted_p = await Promise.all(cypherTextsEncoded.map(async (ciphertext, i) => {
        const decrypted = decrypt(privKey, empheralKeysEncoded[i], ciphertext);
        return decode(babyJub.BASE, decrypted, 19);
    }));
    return combineChunksWithCarry(decrypted_p);
}
// Keep synchronous version for compatibility
export function HEDecryptSync(privKey, cypherTexts, ephemeralKeys) {
    const numChunks = cypherTexts.length / 2;
    const cypherTextsEncoded = [];
    const empheralKeysEncoded = [];
    for (let i = 0; i < numChunks; i++) {
        cypherTextsEncoded.push(coordinatesToExtPointBigint(cypherTexts[i * 2], cypherTexts[(i * 2) + 1]));
        empheralKeysEncoded.push(coordinatesToExtPointBigint(ephemeralKeys[i * 2], ephemeralKeys[(i * 2) + 1]));
    }
    const decrypted_p = [];
    for (let i = 0; i < numChunks; i++) {
        decrypted_p.push(decode(babyJub.BASE, decrypt(privKey, empheralKeysEncoded[i], cypherTextsEncoded[i]), 19));
    }
    return combineChunksWithCarry(decrypted_p);
}
export const hashExtPoints = (extPoints) => {
    var extPointsArray = extPoints.map(point => toBigIntArray(point)).flat();
    return poseidon16(extPointsArray);
};
export const hashCypherText = (message, ephemeralKey, relatedPublicKey, preimage_hash, random_value, unseal_condition_root_hash, metadata_root_commit) => {
    const pointPoseidon = poseidon16(message);
    const emphPoseidon = poseidon16(ephemeralKey);
    const msg = poseidon8([
        pointPoseidon,
        emphPoseidon,
        relatedPublicKey[0],
        relatedPublicKey[1],
        preimage_hash,
        metadata_root_commit,
        unseal_condition_root_hash,
        random_value
    ]);
    return msg;
};
function pruneTo64Bits(originalValue) {
    return originalValue & BigInt("0xFFFFFFFFFFFFFFFF");
}
// Prune the 253-bit BigInt to 32 bits
function pruneTo32Bits(bigInt253Bit) {
    // Create a mask for 32 bits (all bits set to 1)
    const mask32Bit = (1n << 32n) - 1n;
    // Prune to 32 bits using the mask
    const pruned32BitBigInt = bigInt253Bit & mask32Bit;
    return pruned32BitBigInt;
}
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
const getSignalByName = (circuit, witness, signalName) => {
    return witness[circuit.symbols[signalName].varIdx].toString();
};
/**
 * Encrypts a BigInt value using AES-256-CBC encryption
 * @param value - The BigInt value to encrypt
 * @param key - The encryption key as a BigInt
 * @returns The encrypted value as a hex string
 */
function encryptAESBigInt(value, key) {
    // Convert BigInt to hex string
    const valueHex = value.toString(16).padStart(64, '0');
    const keyHex = key.toString(16).padStart(64, '0');
    // Convert hex strings to WordArray
    const valueWords = CryptoJS.enc.Hex.parse(valueHex);
    const keyWords = CryptoJS.enc.Hex.parse(keyHex);
    // Generate random IV
    const ivBytes = portableRandomBytes(16);
    const ivWords = CryptoJS.lib.WordArray.create(ivBytes);
    // Encrypt using AES-256-CBC
    const encrypted = CryptoJS.AES.encrypt(valueWords, keyWords, {
        iv: ivWords,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    // Combine IV and encrypted data
    const combined = ivWords.concat(encrypted.ciphertext);
    // Convert to hex string
    return combined.toString(CryptoJS.enc.Hex);
}
/**
 * Decrypts a hex string back to a BigInt value using AES-256-CBC decryption
 * @param encryptedHex - The encrypted value as a hex string
 * @param key - The decryption key as a BigInt
 * @returns The decrypted BigInt value
 */
function decryptAESBigInt(encryptedHex, key) {
    // Convert key to hex string
    const keyHex = key.toString(16).padStart(64, '0');
    // Convert hex strings to WordArray
    const keyWords = CryptoJS.enc.Hex.parse(keyHex);
    const encryptedWords = CryptoJS.enc.Hex.parse(encryptedHex);
    // Extract IV (first 16 bytes = 4 words) and encrypted data
    const ivWords = CryptoJS.lib.WordArray.create(encryptedWords.words.slice(0, 4));
    const ciphertextWords = CryptoJS.lib.WordArray.create(encryptedWords.words.slice(4));
    // Create CipherParams object for decryption
    const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: ciphertextWords
    });
    // Decrypt using AES-256-CBC
    const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWords, {
        iv: ivWords,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    // Convert back to BigInt
    return BigInt('0x' + decrypted.toString(CryptoJS.enc.Hex));
}
// Helper: Convert bigint to 32-byte little-endian
function toBytesLE(bn, length = 32) {
    const hex = bn.toString(16).padStart(length * 2, '0');
    return Uint8Array.from(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}
export function fromBytesLE(bytes) {
    return bufferToBigInt(bytes);
}
// XOR helper
function xor(a, b) {
    return new Uint8Array(a.map((byte, i) => byte ^ b[i]));
}
// Encrypt and return hex-encoded ciphertext + ephemeral public key
//Both nonce and emperalKey must be set correctly, otherwise the encryption will not be correct.
function encryptECCBabyJub(message, recipientPubKey, nonce = undefined, emperalKey = undefined) {
    const msgBytes = bigInt2Buffer(message);
    const r = nonce ?? generateRandom248BitNumber(); // ephemeral priv
    const R = emperalKey ?? babyJub.BASE.multiply(r); // ephemeral pub key
    const S = recipientPubKey.multiply(r); // shared secret
    const sharedBytes = concatBytes(toBytesLE(S.x), toBytesLE(S.y));
    const key = sha256(sharedBytes).slice(0, msgBytes.length); // KDF
    const ciphertext = xor(msgBytes, key);
    // Serialize R (ephemeral pub key)
    const RxHex = bytesToHex(toBytesLE(R.x));
    const RyHex = bytesToHex(toBytesLE(R.y));
    return {
        ciphertextHex: bytesToHex(ciphertext),
        R: {
            x: RxHex,
            y: RyHex,
        },
    };
}
// Decrypt from hex-encoded ciphertext and ephemeral public key
function decryptECCBabyJub(ciphertextHex, RHex, recipientPrivKey) {
    const ciphertext = hexToBytes(ciphertextHex);
    const Rx = BigInt('0x' + RHex.x);
    const Ry = BigInt('0x' + RHex.y);
    // Reconstruct R as a point
    const R = babyJub.fromAffine({ x: Rx, y: Ry });
    const S = R.multiply(recipientPrivKey); // shared secret
    const sharedBytes = concatBytes(toBytesLE(S.x), toBytesLE(S.y));
    const key = sha256(sharedBytes).slice(0, ciphertext.length);
    const decryptedBytes = xor(ciphertext, key);
    return bufferToBigInt(decryptedBytes);
}
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
export function genRandomBabyJubValue() {
    // Prevent modulo bias
    //const lim = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000')
    //const min = (lim - SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    // 248 bits with MSB set to 1 (2^247)
    const min = BigInt("452312848583266388373324160190187140051835877600158453279131187530910662656");
    let rand;
    while (true) {
        rand = BigInt("0x" + portableRandomBytes(32).toString("hex")) >> 8n; // Shift right by 3 bits to ensure 253 bits
        if (rand >= min) {
            break;
        }
    }
    const privKey = rand % SNARK_FIELD_SIZE;
    return privKey;
}
export function genSmallRandomBabyJubValue() {
    // Generate a random value of approximately 192 bits
    const min = BigInt("63508748781198193123389562824015324");
    let rand;
    while (true) {
        rand = BigInt("0x" + portableRandomBytes(15).toString("hex")); // 24 bytes = 192 bits
        if (rand >= min) {
            break;
        }
    }
    const privKey = rand % SNARK_FIELD_SIZE;
    return privKey;
}
/**
 * @return A BabyJub-compatible private key.
 */
export const genPrivKey = () => {
    const randomBytesBuffer = portableRandomBytes(31); // 31 bytes = 248 bits
    // randomBytesBuffer[0] &= 0x1F; // Mask the first 3 bits to ensure the number is 125 bits
    return BigInt('0x' + randomBytesBuffer.toString('hex'));
    //return genRandomBabyJubValue();
};
/**
 * @return A BabyJub-compatible salt.
 */
export const genRandomSalt = () => {
    return genRandomBabyJubValue();
};
/**
 * @param privKey A private key generated using genPrivKey()
 * @return A public key associated with the private key
 */
export function genPubKey(privKey) {
    // Check whether privKey is a field element
    privKey = BigInt(privKey.toString());
    //assert.ok(privKey < SNARK_FIELD_SIZE);
    return prv2pub(bigInt2Buffer(privKey));
}
export function genKeypair(scalar = 0n) {
    const privKey = scalar || genPrivKey();
    const pubKey = genPubKey(privKey);
    const Keypair = { privKey, pubKey };
    return Keypair;
}
// export function genRandomPoint(): BabyJubExtPoint {
//     const salt = genRandomBabyJubValue();
//     return genPubKey(salt);
// }
/**
 * Encrypts a plaintext such that only the owner of the specified public key
 * may decrypt it.
 * @param pubKey The recepient's public key
 * @param encodedMessage A plaintext encoded as a BabyJub curve point (optional)
 * @param randomVal A random value y used along with the private key to generate the ciphertext (optional)
 */
export function encrypt(pubKey, encodedMessage, randomVal) {
    const message = encodedMessage;
    // The sender chooses a secret key as a nonce
    const nonce = randomVal ?? formatPrivKeyForBabyJub(genRandomSalt());
    // The sender calculates an ephemeral key => [nonce].Base
    const ephemeral_key = babyJub.BASE.multiply(nonce);
    const masking_key = pubKey.multiply(nonce);
    let encrypted_message;
    // The sender encrypts the encodedMessage
    pubKey.assertValidity();
    if (!pubKey.equals(babyJub.ZERO)) {
        encrypted_message = message.add(masking_key);
    }
    else
        throw new Error("Invalid Public Key!");
    return { message, ephemeral_key, encrypted_message, nonce };
}
/**
 * Decrypts a ciphertext using a private key.
 * @param privKey The private key
 * @param ciphertext The ciphertext to decrypt
 */
export function decrypt(privKey, ephemeral_key, encrypted_message) {
    // The receiver decrypts the message => encryptedMessage - [privKey].ephemeralKey
    const masking_key = ephemeral_key.multiply(formatPrivKeyForBabyJub(privKey));
    const decrypted_message = encrypted_message.add(masking_key.negate());
    return decrypted_message;
}
export function HEAdd(empheralKey1, empheralKey2, encryptedMessage1, encryptedMessage2) {
    const ephemeralKey = empheralKey1.add(empheralKey2);
    const encryptedMessage = encryptedMessage1.add(encryptedMessage2);
    return { ephemeralKey, encryptedMessage };
}
export function HEAddAll(empheralKeys1, empheralKeys2, encryptedMessages1, encryptedMessages2) {
    var ephemeralKeys = [];
    var encryptedMessages = [];
    for (let i = 0; i < empheralKeys1.length; i++) {
        const ephemeralKey = empheralKeys1[i].add(empheralKeys2[i]);
        const encryptedMessage = encryptedMessages1[i].add(encryptedMessages2[i]);
        ephemeralKeys.push(ephemeralKey);
        encryptedMessages.push(encryptedMessage);
    }
    return { ephemeralKeys, encryptedMessages };
}
function babyJubAdd(a, b) {
    return (a + b) % SNARK_FIELD_SIZE;
}
// ElGamal Scheme with specified inputs for testing purposes
export function encrypt_s(message, public_key, nonce) {
    nonce = nonce ?? genRandomSalt();
    const ephemeral_key = babyJub.BASE.multiply(nonce);
    const masking_key = public_key.multiply(nonce);
    const encrypted_message = masking_key.add(message);
    return { ephemeral_key, encrypted_message };
}
/**
 * Randomize a ciphertext such that it is different from the original
 * ciphertext but can be decrypted by the same private key.
 * @param pubKey The same public key used to encrypt the original encodedMessage
 * @param ciphertext The ciphertext to re-randomize.
 * @param randomVal A random value z such that the re-randomized ciphertext could have been generated a random value y+z in the first
 *                  place (optional)
 */
function rerandomize(pubKey, ephemeral_key, encrypted_message, randomVal) {
    const nonce = randomVal ?? genRandomSalt();
    const randomized_ephemeralKey = ephemeral_key.add(babyJub.BASE.multiply(nonce));
    const randomized_encryptedMessage = encrypted_message.add(pubKey.multiply(nonce));
    return { randomized_ephemeralKey, randomized_encryptedMessage };
}
export { stringToCurve, combineTwoPublicKeys, uint8ArrayToHex, pruneBuffer, privateScalarToPubKey, prv2pub, bigInt2Buffer, hexString2Buffer, buffer2HexString, toBytesLE, getSignalByName, stringifyBigInts, unstringifyBigInts, toStringArray, toBigIntArray, formatPrivKeyForBabyJub, coordinatesToExtPoint, pruneTo64Bits, pruneTo32Bits, ffEncodedToBigInt, encryptAESBigInt, decryptAESBigInt, encryptECCBabyJub, decryptECCBabyJub };
