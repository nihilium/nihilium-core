/**
 * @nihilium/registry — TypeScript client library
 *
 * Usage (ProcessorClient):
 *
 *   import { ProcessorClient } from "@nihilium/registry";
 *   import { ZeroAddress, parseEther } from "ethers";
 *
 *   const client = new ProcessorClient({
 *     ethPrivateKey:      "0xdeadbeef...",
 *     hePrivateKeys:      ["0xabc..."],
 *     signingPrivateKeys: ["0xdef..."],
 *     rpcEndpoint:        "https://rpc.example.com",
 *     contractAddress:    "0x1234...",
 *     metadata: { name: "My Processor", description: "", url: "https://...", tor: "" },
 *     gracePeriodSeconds:  86400,
 *   });
 *
 *   await client.init();
 *   await client.register();
 *   await client.addAllKeys();
 *   await client.stake.addStake(ZeroAddress, parseEther("1"));
 *
 * Usage (DatastreamClient):
 *
 *   import { DatastreamClient } from "@nihilium/registry";
 *
 *   const ds = new DatastreamClient({
 *     ethPrivateKey:      "0x...",
 *     signingPrivateKeys: ["0x..."],
 *     rpcEndpoint:        "https://rpc.example.com",
 *     contractAddress:    "0x<DatastreamRegistryAddress>",
 *     datastreamContract: "0x<IDataStreamContractAddress>",
 *     metadata: { name: "My Stream", description: "", url: "https://...", tor: "" },
 *     gracePeriodSeconds:  43200,
 *   });
 *
 *   await ds.init();
 *   await ds.register();
 *   await ds.addAllKeys();
 */

export { ProcessorClient } from "./ProcessorClient";
export { DatastreamClient } from "./DatastreamClient";
export { StakeManager }     from "./StakeManager";

// Contract ABIs (from Forge build artifacts)
export { processorRegistryAbi, datastreamRegistryAbi, conditionVerifierRegistryAbi } from "./abis";

// BJJ utilities — Solidity-encoding layer (challenge builders, keyId, Schnorr PoK)
// Key derivation lives in @nihilium/zkp-circuits:
//   deriveHEPublicKey / deriveHEKeyScalar        — HE keys (blake2b path)
//   deriveSigningPublicKey / deriveSigningKeyScalar — Signing keys (sha512 path)
export {
  babyJub,
  generateSchnorrProof,
  buildProcessorKeyChallenge,
  buildDatastreamKeyChallenge,
  keyId,
  isOnCurve,
  isIdentity,
  FIELD_MODULUS,
  ORDER,
  BASE8_X,
  BASE8_Y,
} from "./babyjubjub";

export type { BabyJubPoint, SchnorrProof } from "./babyjubjub";
export { registryContracts } from "./registry_contracts";
export type { RegistryContracts } from "./registry_contracts";
export type {
  ProcessorConfig,
  ProcessorMetadata,
  ProcessorOnChainInfo,
  KeyRecord,
  KeyType,
  PendingRemoval,
  StakeManagerConfig,
} from "./types";

export type {
  DatastreamConfig,
  DatastreamMetadata,
  DatastreamKeyRecord,
  DatastreamOnChainInfo,
} from "./DatastreamClient";
