// import { BabyJubAffinePoint, BabyJubExtPoint, SNARK_FIELD_SIZE,babyJub } from "./types";
// import { PubKey, PrivKey } from "./types"; // adjust to your actual types
// import { decode16, encode } from "./decode";
// import {
//   encrypt,
//   decrypt,
  
  
//   formatPrivKeyForBabyJub,
//   genRandomSalt,
//   generateRandom248BitNumber,
//   encryptECCBabyJub,
//   toBytesLE,
//   decryptECCBabyJub,
//   genPubKey
// } from "./tools"; // adjust to your actual module
// import { bytesToHex } from "@noble/hashes/utils";


// /*
// Full-Disclosure Threshold Encryption AKA combinatorial threshold encryption from the paper
// This methods takes M amount of public keys and generates N amount of new public keys where N<M.
// This is combinatorial, so it blows up to quite heavily.

// But it does not require a direct threshold similar to SSS. 
// You can do 3/10. = 120 resulting in equal amounts of ciphertexts
// Or a classic 5/10. = 252 resulting in equal amounts of ciphertexts
// Or for high availability you can do 3/20= 1140

// */


// export function FDTEncrypt(message: bigint, pubKeys: PubKey[], threshold: number) {
//     if(threshold > pubKeys.length) {
//         throw new Error("Threshold is greater than the number of public keys");
//     }
//     if(threshold < 1) {
//         throw new Error("Threshold is less than 1");
//     }
//     console.time("FDTEncrypt");
//     console.time("generateCombinations");
//     //generate compbination of pubKeys
//     var combinations = generateCombinations(pubKeys, threshold);
//     console.timeEnd("generateCombinations");
//     console.time("combinePublicKeys");
//     var combinedPubKeys = combinations.map(combination => {
//         return combinePublicKeys(combination);
//     });
//     console.timeEnd("combinePublicKeys");
//     console.time("encryptECCBabyJub");
//     //encrypt message with each combination
//     var ciphertextMap = {};
//     var nonce = generateRandom248BitNumber();
//     var empheralKey = babyJub.BASE.multiply(nonce)
//     const RxHex = bytesToHex(toBytesLE(empheralKey.x));
//     const RyHex = bytesToHex(toBytesLE(empheralKey.y));
//     combinedPubKeys.forEach(newPubKey => {
//         //For storage efficiency, we use the first 8 characters of the public key as the index
//         var index = newPubKey.toHex().substring(0, 8);
//         if(!ciphertextMap[index]) { 
//             ciphertextMap[index] = encryptECCBabyJub(message, newPubKey, nonce, empheralKey).ciphertextHex;
//         }else{
//             //but if it already exist just use the complete key instead.
//             ciphertextMap[newPubKey.toHex()] = encryptECCBabyJub(message, newPubKey, nonce, empheralKey).ciphertextHex;
//         }
        
//     });
//     console.timeEnd("encryptECCBabyJub");
//     console.timeEnd("FDTEncrypt");
//     return {cipherTexts: ciphertextMap, empheralKey: {x: RxHex, y: RyHex}};
// }

// export function FDTDecrypt(privateKeys: PrivKey[], ciphertextMap: { [key: string]: string }, empheralKey: { x: string; y: string }) {
//     console.time("FDTDecrypt");
//     console.time("decryptECCBabyJub");

//     var combinedPrivateKey = privateKeys.reduce((acc, privateKey) => acc + privateKey, 0n)
//     var pubKey = babyJub.BASE.multiply(combinedPrivateKey)
//     var subkey = pubKey.toHex().substring(0, 8);
//     var ciphertext = ciphertextMap[subkey];
//     if(!ciphertext) {
//         ciphertext = ciphertextMap[pubKey.toHex()];
//     }
//     if(!ciphertext) {
//         throw new Error("Ciphertext not found");
//     }

//     var decrypted = decryptECCBabyJub(ciphertext, empheralKey, combinedPrivateKey);
//     console.timeEnd("decryptECCBabyJub");
//     console.timeEnd("FDTDecrypt");
//     return decrypted.toString();
// }

// function combinePublicKeys(pubKeys: PubKey[]) {
//    var combinedPubKey = pubKeys[0];
//    for(let i = 1; i < pubKeys.length; i++) {
//      combinedPubKey = combinedPubKey.add(pubKeys[i]);
//    }
//    return combinedPubKey;
// }

// function generateCombinations(pubKeys: PubKey[], threshold: number) {
//     // Generate all subsets of `pubKeys` with size exactly `threshold`.
//     // Example: M=10, threshold=3 => C(10,3)=120 combinations.
//     const n = pubKeys.length;
//     const k = threshold;

//     if (k > n) return [];
//     if (k === 1) return pubKeys.map((pk) => [pk]);
//     if (k === 0) return [[]];

//     const combinations: PubKey[][] = [];
//     const path: PubKey[] = new Array(k);

//     const backtrack = (startIndex: number, depth: number) => {
//         if (depth === k) {
//             combinations.push(path.slice());
//             return;
//         }

//         // Ensure we have enough elements left to fill the rest of the combination.
//         for (let i = startIndex; i <= n - (k - depth); i++) {
//             path[depth] = pubKeys[i];
//             backtrack(i + 1, depth + 1);
//         }
//     };

//     backtrack(0, 0);
//     return combinations;
// }