import { babyJub } from "./types";


/**
 * Build a lookup table to break discrete log for 32-bit scalars for decoding
 * @param precomputeSize the size of the lookup table to be used --> 2**pc_size
 * @returns an object that contains 2**pc_size of keys and values
 */
export function precompute(precomputeSize: number) {
    
    //Check if the file already exists
   
    // Check if the lookupTables directory exists

  
    const range = 32 - precomputeSize;
    const upperBound = BigInt(2) ** BigInt(precomputeSize);

    let lookupTable: { [key: string]: string } = {};
    let key: string;
    var max = Number(upperBound);
    var last_percent = 0;

    for (let xhi = BigInt(0); xhi < upperBound; xhi++) {
        key = babyJub.BASE.multiplyUnsafe(xhi * BigInt(2) ** BigInt(range))
            .toAffine()
            .x.toString();
        lookupTable[key] = xhi.toString(16);
        
        const current_percent = Math.floor(((Number(xhi) + 1) / max) * 100);
        if (current_percent >= last_percent + 5) {
            console.log(`Progress: ${current_percent}%`);
            last_percent = current_percent;
        }
    }
    
    //var path = path.join(directoryName, `x${precomputeSize}xlookupTable.json`);
    //fs.writeFileSync(path, JSON.stringify(lookupTable));
    return lookupTable;
}

//if (require.main === module) {
//     precompute(Number(process.argv[2]) || 19);
//}
