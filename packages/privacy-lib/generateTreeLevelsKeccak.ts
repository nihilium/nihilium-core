import { keccak256 } from "ethers";
import path from "path";
import fs from "fs";
//console.log(aaa);
import { toPaddedHex } from "./src/lib/utils";
// const outputPath = `${__dirname}/contracts/mimc7.json`;
  (async () => {
    const hashFunction = (left:any, right:any): string => {
      
        var pos = keccak256(toPaddedHex(left) + toPaddedHex(right).slice(2))
        return toPaddedHex(BigInt(pos));
    
  };
  var ZERO = hashFunction(42n, 42n);
  var levels: any[] = [toPaddedHex(BigInt(ZERO))];
  console.log(ZERO);
  const LEVELS = 32;
  var latestLevel = toPaddedHex(BigInt(ZERO));
  for (let i = 1; i <= LEVELS; i++) {
    latestLevel = hashFunction(latestLevel, latestLevel);
    levels.push(toPaddedHex(BigInt(latestLevel)));
  }
  console.log(JSON.stringify(levels, null, 2));

let output = "if (i == 0) return bytes32(" + levels[0] + ");\n";
for (let i = 1; i < LEVELS; i++) {
  output += `else if (i == ${i}) return bytes32(${levels[i]});\n`;
}
output += 'else revert("Index out of bounds");';
console.log(output);
})();



