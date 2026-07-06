/**
 * Quick CLI to print challenge + PoK inputs for debugging live addKey failures.
 *
 *   npx ts-node --project test/tsconfig.json test/helpers/verifyChallenge.ts \
 *     <hexKey> <0|1> <processorAddress> <registryAddress> <chainId>
 */

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
  keyId,
} from "../../src/babyjubjub";

async function main(): Promise<void> {
  const [hexKey, keyTypeStr, sender, registry, chainIdStr] = process.argv.slice(2);
  if (!hexKey || !keyTypeStr || !sender || !registry || !chainIdStr) {
    console.error(
      "usage: verifyChallenge.ts <hexKey> <0|1> <processor> <registry> <chainId>"
    );
    process.exit(1);
  }

  const keyType = Number(keyTypeStr) as 0 | 1;
  const chainId = BigInt(chainIdStr);
  const keyMaterial = keyType === 1 ? normalizeSigningKeyMaterial(hexKey) : 0n;

  const [keyX, keyY] =
    keyType === 0
      ? deriveHEPublicKey(hexKey)
      : await deriveSigningPublicKey(hexKey);
  const scalar =
    keyType === 0
      ? deriveHEKeyScalar(hexKey)
      : await deriveSigningKeyScalar(hexKey);

  const challenge = buildProcessorKeyChallenge(
    sender,
    keyX,
    keyY,
    keyType,
    registry,
    chainId,
    keyMaterial
  );
  const proof = generateSchnorrProof(scalar, challenge);

  console.log(JSON.stringify({
    keyId: keyId(keyX, keyY),
    keyX: keyX.toString(),
    keyY: keyY.toString(),
    keyMaterial: keyMaterial.toString(),
    scalar: scalar.toString(),
    challenge: challenge.toString(),
    proofRx: proof.Rx.toString(),
    proofRy: proof.Ry.toString(),
    proofS: proof.s.toString(),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
