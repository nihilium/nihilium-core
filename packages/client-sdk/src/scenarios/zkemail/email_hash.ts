import * as nhsdk from "@nihilium/core";

/**
 * The field element ZKEmailModule expects as `email_address_hash`, and which the circuit exposes as
 * `from_address_hash`. Both sides must pack the address identically or the proof simply will not
 * verify, so this mirrors the Noir circuit's layout exactly:
 *
 *   - the address is UTF-8 encoded and packed little-endian into 9 field elements,
 *   - limbs 0-7 take 31 bytes each, limb 8 takes the remaining 8 (bytes 248-255),
 *   - the limbs are hashed with Poseidon-9 over BN254 (poseidon::bn254::hash_9).
 *
 * Addresses longer than 256 bytes are rejected rather than silently truncated — the circuit would
 * hash a different value and the failure would surface much later as an unverifiable proof.
 */
export function hashEmailAddress(emailAddress: string): string {
    const emailBytes = new TextEncoder().encode(emailAddress);
    if (emailBytes.length > 256) {
        throw new Error(
            `Email address is ${emailBytes.length} bytes; the ZKEmail circuit packs at most 256`);
    }

    const senderPacked: bigint[] = new Array(9).fill(0n);
    // Limbs 0-7: 31 bytes each, least-significant byte first.
    for (let chunk = 0; chunk < 8; chunk++) {
        let packed = 0n;
        let power = 1n;
        for (let j = 0; j < 31; j++) {
            const byteIdx = chunk * 31 + j;
            if (byteIdx < emailBytes.length) {
                packed = packed + BigInt(emailBytes[byteIdx]) * power;
            }
            power = power * 256n;
        }
        senderPacked[chunk] = packed;
    }
    // Limb 8: the remaining 8 bytes (248..255).
    let packed = 0n;
    let power = 1n;
    for (let j = 0; j < 8; j++) {
        const byteIdx = 248 + j;
        if (byteIdx < emailBytes.length) {
            packed = packed + BigInt(emailBytes[byteIdx]) * power;
        }
        power = power * 256n;
    }
    senderPacked[8] = packed;

    return nhsdk.utils.toPaddedHex(nhsdk.cryptoTools.poseidonTools.poseidon9(senderPacked));
}
