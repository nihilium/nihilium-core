import {buildMimc7} from "circomlibjs";
import path from "path";
import fs from "fs";
//console.log(aaa);
import { toPaddedHex } from "./src/lib/utils";
const outputPath = `${__dirname}/contracts/mimc7.json`;
  (async () => {
    const mimc = await buildMimc7()
    const hashFunction = (left:any, right:any) => {
      var pos = mimc.hash(BigInt(left), BigInt(right))
      var curvePoint = mimc.F.toString(pos)           
      return curvePoint;
  };
  var ZERO = hashFunction(42n, 42n);
  var levels: any[] = [toPaddedHex(ZERO)];
  console.log(ZERO);
  const LEVELS = 32;
  var latestLevel = ZERO;
  for (let i = 1; i <= LEVELS; i++) {
    latestLevel = hashFunction(latestLevel, latestLevel);
    levels.push(toPaddedHex(latestLevel));
  }
  console.log(JSON.stringify(levels, null, 2));

let output = "if (i == 0) return uint256(" + levels[0] + ");\n";
for (let i = 1; i < LEVELS; i++) {
  output += `else if (i == ${i}) return uint256(${levels[i]});\n`;
}
output += 'else revert("Index out of bounds");';
console.log(output);
})();



