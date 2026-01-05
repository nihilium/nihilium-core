import fs from "fs";
// Add base point cache at the top of the file after imports
const basePointCache = new Map();
// Optimized base point function with caching
function getOrComputeBasePoint(babyJubBase, scalar) {
    const key = scalar.toString();
    if (!basePointCache.has(key)) {
        basePointCache.set(key, babyJubBase.multiplyUnsafe(scalar));
    }
    return basePointCache.get(key);
}
function fetch_table(precomputeSize) {
    const file = fs.readFileSync(`./lookupTables/x${precomputeSize}xlookupTable.json`);
    const table = JSON.parse(file.toString());
    // Convert to Map for better performance
    lookupTableMap = new Map(Object.entries(table));
    return table;
}
let lookupTable;
let lookupTableMap;
// Optimized decode function
function optimizedDecode(babyJubBase, encoded, precomputeSize) {
    // Initialize lookup table and map if needed
    if (!lookupTable || Object.keys(lookupTable).length != 2 ** precomputeSize) {
        lookupTable = fetch_table(precomputeSize);
    }
    if (!lookupTableMap) {
        lookupTableMap = new Map(Object.entries(lookupTable));
    }
    const range = 32 - precomputeSize;
    const rangeBound = BigInt(2) ** BigInt(range);
    // Cache the encoded point's affine representation
    const encodedAffine = encoded.toAffine();
    const encodedX = encodedAffine.x;
    const encodedY = encodedAffine.y;
    // Get base point affine coordinates for debugging
    const baseAffine = babyJubBase.toAffine();
    const baseX = baseAffine.x;
    const baseY = baseAffine.y;
    // Debug logging
    console.log(`[Decode] Range: ${range}, RangeBound: ${rangeBound.toString()}`);
    console.log(`[Decode] Base point x: ${baseX.toString()}, y: ${baseY.toString()}`);
    console.log(`[Decode] Encoded point x: ${encodedX.toString()}, y: ${encodedY.toString()}`);
    // Optimized search with cached base points
    for (let xlo = BigInt(0); xlo < rangeBound; xlo++) {
        const loBase = getOrComputeBasePoint(babyJubBase, xlo);
        const subtracted = encoded.subtract(loBase);
        const subtractedAffine = subtracted.toAffine();
        const key = subtractedAffine.x.toString();
        const inTable = lookupTableMap.has(key);
        // Debug logging for each iteration
        if (xlo < 10n) {
            console.log(`[Decode] xlo=${xlo.toString()}, key=${key}, in_table=${inTable}`);
        }
        if (inTable) {
            const tableValue = lookupTableMap.get(key);
            const result = xlo + rangeBound * BigInt("0x" + tableValue);
            console.log(`[Decode] FOUND at xlo=${xlo.toString()}, result=${result.toString()}`);
            return result;
        }
    }
    console.log(`[Decode] Not Found after ${rangeBound.toString()} iterations`);
    throw new Error("Not Found!");
}
// Keep original decode function for compatibility
function decode(babyJubBase, encoded, precomputeSize) {
    return optimizedDecode(babyJubBase, encoded, precomputeSize);
}
function encode(babyJubBase, plaintext) {
    if (plaintext <= BigInt(2) ** BigInt(32)) {
        return babyJubBase.multiplyUnsafe(plaintext);
    }
    else
        throw new Error("The input should be 32-bit bigint");
}
// xlo and xhi merging  verification
function split64(x) {
    function padBin(x) {
        return "0".repeat(64 - x.length) + x;
    }
    const limit = BigInt(2) ** BigInt(64n);
    if (x <= limit) {
        const bin64 = padBin(x.toString(2));
        // the first 32 bits
        const xhi = "0b" + bin64.substring(0, 32);
        // the last 32 bits
        const xlo = "0b" + bin64.substring(32, 64);
        return [BigInt(xlo), BigInt(xhi)];
    }
    else
        throw new Error("The input should be 64-bit bigint");
}
export { decode, optimizedDecode, encode, split64 };
