import { ExtPointType } from "@noble/curves/abstract/edwards";
import fs from "fs";
import { precompute } from "./precompute";

// Add base point cache at the top of the file after imports
const basePointCache = new Map<string, ExtPointType>();
const decode16Cache = new Map<string, bigint>();
let decode16Ready = false;

// Optimized base point function with caching
function getOrComputeBasePoint(babyJubBase: ExtPointType, scalar: bigint): ExtPointType {
    const key = scalar.toString();
    if (!basePointCache.has(key)) {
        basePointCache.set(key, babyJubBase.multiplyUnsafe(scalar));
    }
    return basePointCache.get(key)!;
}

function fetch_table(precomputeSize: number) {

    if(!fs.existsSync(`./lookupTables/x${precomputeSize}xlookupTable.json`)) {
        var table = precompute(precomputeSize);
        lookupTableMap = new Map(Object.entries(table));
        fs.writeFileSync(`./lookupTables/x${precomputeSize}xlookupTable.json`, JSON.stringify(table));
    }else{
        const file = fs.readFileSync(`./lookupTables/x${precomputeSize}xlookupTable.json`);
        const table = JSON.parse(file.toString());
        
        // Convert to Map for better performance
        lookupTableMap = new Map(Object.entries(table));
    }
    return lookupTableMap;
}

let lookupTable: any;
let lookupTableMap: Map<string, string>;

function pointKey(point: ExtPointType): string {
    const affine = point.toAffine();
    return `${affine.x.toString()}:${affine.y.toString()}`;
}

function ensureDecode16Table(babyJubBase: ExtPointType) {
    if (decode16Ready) return;
    for (let m = 0n; m < 65536n; m++) {
        const p = babyJubBase.multiplyUnsafe(m);
        decode16Cache.set(pointKey(p), m);
    }
    decode16Ready = true;
}

function decode16(babyJubBase: ExtPointType, encoded: ExtPointType): bigint {
    ensureDecode16Table(babyJubBase);
    const value = decode16Cache.get(pointKey(encoded));
    if (value === undefined) {
        throw new Error("Not Found!");
    }
    return value;
}

// Optimized decode function
function optimizedDecode(babyJubBase: ExtPointType, encoded: ExtPointType, precomputeSize: number): bigint {
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
        if(xlo < 10n){
            console.log(`[Decode] xlo=${xlo.toString()}, key=${key}, in_table=${inTable}`);
        }
        if (inTable) {
            const tableValue = lookupTableMap.get(key)!;
            const result = xlo + rangeBound * BigInt("0x" + tableValue);
            console.log(`[Decode] FOUND at xlo=${xlo.toString()}, result=${result.toString()}`);
            return result;
        }
    }
    
    console.log(`[Decode] Not Found after ${rangeBound.toString()} iterations`);
    throw new Error("Not Found!");
}

// Keep original decode function for compatibility
function decode(babyJubBase: ExtPointType, encoded: ExtPointType, precomputeSize: number): bigint {
    return optimizedDecode(babyJubBase, encoded, precomputeSize);
}

function encode(babyJubBase: ExtPointType, plaintext: bigint): ExtPointType {
    if (plaintext <= BigInt(2) ** BigInt(32)) {
        return babyJubBase.multiplyUnsafe(plaintext);
    } else throw new Error("The input should be 32-bit bigint");
}

// xlo and xhi merging  verification
function split64(x: bigint): [bigint, bigint] {
    function padBin(x: string) {
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
    } else throw new Error("The input should be 64-bit bigint");
}

export { decode, decode16, optimizedDecode, encode, split64 };
