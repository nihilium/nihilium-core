import * as aaa from "circomlibjs";
import path from "path";
import fs from "fs";
//console.log(aaa);

const outputPath = `${__dirname}/contracts/mimc7.json`;
// (async () => {
//     const mimc = aaa.mimc7Contract.createCode("mimc", 91);
//     console.log(mimc);
    
// })();

function main() {
    const contract = {
      contractName: 'Mimc7',
      abi: aaa.mimc7Contract.abi,
      bytecode: aaa.mimc7Contract.createCode('mimc', 91),
    }
  
    fs.writeFileSync(outputPath, JSON.stringify(contract))
  }
  
  main()



