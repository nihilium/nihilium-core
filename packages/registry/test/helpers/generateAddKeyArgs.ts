/**
 * Emits abi.encode(keyX, keyY, keyType, proofRx, proofRy, proofS, keyMaterial)
 * to stdout for ProcessorRegistry.addKey — used by Forge tests via vm.ffi.
 *
 * Usage:
 *   npx ts-node test/helpers/generateAddKeyArgs.ts <hexKey> <keyType> <sender> <registry> <chainId> <outFile> [legacy]
 *
 * keyType: 0 = HE, 1 = Signing
 * legacy:  if "legacy", use the pre-keyMaterial signing challenge (should fail on-chain)
 */

import { ethers } from "ethers";
import * as fs from "fs";
import {
  deriveSigningPublicKey,
  deriveSigningKeyScalar,
  deriveHEPublicKey,
  deriveHEKeyScalar,
  normalizeSigningKeyMaterial,
} from "@nihilium/zkp-circuits";
import {
  buildProcessorKeyChallenge,
  generateSchnorrProof,
  ORDER,
} from "../../src/babyjubjub";

function buildLegacySigningChallenge(
  sender: string,
  keyX: bigint,
  keyY: bigint,
  contractAddress: string,
  chainId: bigint
): bigint {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256", "address", "uint256"],
    [sender, keyX, keyY, 1n, contractAddress, chainId]
  );
  return BigInt(hash) % ORDER;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const legacyFlag = argv[argv.length - 1] === "legacy" ? argv.pop() : undefined;
  const [hexKey, keyTypeStr, sender, contractAddress, chainIdStr, outFile] = argv;

  if (!hexKey || !keyTypeStr || !sender || !contractAddress || !chainIdStr || !outFile) {
    console.error(
      "usage: generateAddKeyArgs.ts <hexKey> <0|1> <sender> <registry> <chainId> <outFile> [legacy]"
    );
    process.exit(1);
  }

  const keyType = Number(keyTypeStr) as 0 | 1;
  const chainId = BigInt(chainIdStr);
  const useLegacy = legacyFlag === "legacy";

  let keyX: bigint;
  let keyY: bigint;
  let scalar: bigint;
  let keyMaterial: bigint;

  if (keyType === 0) {
    [keyX, keyY] = deriveHEPublicKey(hexKey);
    scalar = deriveHEKeyScalar(hexKey);
    keyMaterial = 0n;
  } else {
    [keyX, keyY] = await deriveSigningPublicKey(hexKey);
    scalar = await deriveSigningKeyScalar(hexKey);
    keyMaterial = normalizeSigningKeyMaterial(hexKey);
  }

  const challenge =
    keyType === 1 && useLegacy
      ? buildLegacySigningChallenge(sender, keyX, keyY, contractAddress, chainId)
      : buildProcessorKeyChallenge(
          sender,
          keyX,
          keyY,
          keyType,
          contractAddress,
          chainId,
          keyMaterial
        );

  const { Rx, Ry, s } = generateSchnorrProof(scalar, challenge);

  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
    [keyX, keyY, BigInt(keyType), Rx, Ry, s, keyMaterial]
  );

  fs.writeFileSync(outFile, ethers.getBytes(encoded));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
