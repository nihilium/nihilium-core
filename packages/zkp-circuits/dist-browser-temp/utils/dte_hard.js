import { babyJub } from "./types";
import { generateRandom240BitNumber, toBytesLE, encryptECCBabyJub, decryptECCBabyJub, bigInt2Buffer, bufferToBigInt, } from "./tools";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
export function FDTEncrypt(message, pubKeys, threshold, m = 1) {
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
    const combinations = {};
    for (const indexSet of indexCombinations(pubKeys.length, threshold)) {
        // Canonical member ordering so seal and unseal agree on lane positions.
        const members = indexSet
            .map((i) => pubKeys[i])
            .sort((a, b) => a.toHex().localeCompare(b.toHex()));
        // --- Lanes: m random scalars per member, each encrypted under that member's key ---
        const laneScalars = []; // [memberPos][laneIdx]
        const lanes = [];
        for (const memberPubKey of members) {
            const memberScalars = [];
            const memberLanes = [];
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
export function FDTDecrypt(privateKeys, pkg) {
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
    const laneScalars = []; // [memberPos][laneIdx]
    for (let pos = 0; pos < k; pos++) {
        const memberScalars = seal.lanes[pos].map((lane) => decryptECCBabyJub(lane.c, lane.R, keyPairs[pos].sk));
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
function kdfFromZ(z, length) {
    return sha256(toBytesLE(z)).slice(0, length);
}
/** Stable identifier for a combination from its (already sorted) member points. */
function combinationIndex(sortedMembers) {
    const parts = sortedMembers.map((p) => concatBytes(toBytesLE(p.x), toBytesLE(p.y)));
    return bytesToHex(sha256(concatBytes(...parts)));
}
/** All k-subsets of {0, ..., n-1} as ascending index arrays. */
function indexCombinations(n, k) {
    if (k > n || k < 0)
        return [];
    if (k === 0)
        return [[]];
    const combinations = [];
    const path = new Array(k);
    const backtrack = (start, depth) => {
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
function xor(a, b) {
    if (a.length !== b.length) {
        throw new Error(`xor length mismatch: ${a.length} vs ${b.length}`);
    }
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}
