// @ts-ignore
import deployedContracts1337 from "../scripts/deployed-contracts-1337.json";
// @ts-ignore
import deployedContracts43113 from "../scripts/deployed-contracts-43113.json";
// @ts-ignore
import networkConfig from "../scripts/chain_config.json";
// @ts-ignore
import deployedContractsAnvil from "../scripts/deployed-contracts-31337.json";

export var NETWORK_IDS = {
  ANVIL: 31337,
  GENANCHE: 1337,
  AVAX_TESTNET: 43113,
  CUSTOM: 0,
}

export var deployedProtocolContracts = {
  [NETWORK_IDS.ANVIL]: deployedContractsAnvil,
  [NETWORK_IDS.GENANCHE]: deployedContracts1337,
  [NETWORK_IDS.AVAX_TESTNET]: deployedContracts43113,
  [NETWORK_IDS.CUSTOM]: {},
}

export function toAddressMap(networkId: number) {
  if (!deployedProtocolContracts[networkId]) {
    throw new Error(`Network ID ${networkId} not found`);
  }
  var aaa = deployedProtocolContracts[networkId]
  return {
    "opening_proof": deployedProtocolContracts[networkId]?.opening_proof?.address,
    "TopLevelMerkleProof": deployedProtocolContracts[networkId].TopLevelMerkleProof.address,
    "SubTreeMerkleProof": deployedProtocolContracts[networkId]?.SubTreeMerkleProof?.address,
    "KeccakTreeEntry": deployedProtocolContracts[networkId]?.KeccakTreeEntry?.address,
    "GreaterOrEqualThen": deployedProtocolContracts[networkId]?.GreaterOrEqualThen?.address,
    "SmallerThan": deployedProtocolContracts[networkId]?.SmallerThan?.address,
    "TimeDelayProof": deployedProtocolContracts[networkId]?.TimeDelayProof?.address,
  }
}
