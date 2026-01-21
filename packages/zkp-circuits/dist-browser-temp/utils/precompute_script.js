import { babyJub } from "./types";
const fs = require("fs");
const ProgressBar = require("cli-progress");
const bar = new ProgressBar.SingleBar({
    format: "Progress |" +
        "{bar}" +
        "| {percentage}% || {value}/{total} Chunks || Remaining time: {eta_formatted}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
});
/**
 * Build a lookup table to break discrete log for 32-bit scalars for decoding
 * @param precomputeSize the size of the lookup table to be used --> 2**pc_size
 * @returns an object that contains 2**pc_size of keys and values
 */
export function precompute(precomputeSize, directoryName = "lookupTables") {
    //Check if the file already exists
    var path = path.join(directoryName, `x${precomputeSize}xlookupTable.json`);
    if (fs.existsSync(path)) {
        console.log(`Lookup table already exists at ${path}`);
        return path;
    }
    // Check if the lookupTables directory exists
    if (!fs.existsSync(directoryName)) {
        // If it doesn't exist, create it
        fs.mkdirSync(directoryName);
        console.log(`Directory "${directoryName}" created.`);
    }
    const range = 32 - precomputeSize;
    const upperBound = BigInt(2) ** BigInt(precomputeSize);
    let lookupTable = {};
    let key;
    bar.start(Number(upperBound), 0);
    for (let xhi = BigInt(0); xhi < upperBound; xhi++) {
        key = babyJub.BASE.multiplyUnsafe(xhi * BigInt(2) ** BigInt(range))
            .toAffine()
            .x.toString();
        lookupTable[key] = xhi.toString(16);
        bar.update(Number(xhi) + 1);
    }
    bar.stop();
    var path = path.join(directoryName, `x${precomputeSize}xlookupTable.json`);
    fs.writeFileSync(path, JSON.stringify(lookupTable));
    return path;
}
//if (require.main === module) {
//     precompute(Number(process.argv[2]) || 19);
//}
