// @ts-ignore
import deployedContracts1337 from "../scripts/deployed-contracts-1337.json";
// @ts-ignore
import deployedContracts43113 from "../scripts/deployed-contracts-43113.json";
// @ts-ignore
import networkConfig from "../scripts/chain_config.json";

export var NETWORK_IDS = {
  GENANCHE: 1337,
  AVAX_TESTNET: 43113,
}

export var deployedProtocolContracts = {
  [NETWORK_IDS.GENANCHE]: deployedContracts1337,
  [NETWORK_IDS.AVAX_TESTNET]: deployedContracts43113,
}

export function toAddressMap(networkId: number) {
  return {
    "opening_proof": deployedProtocolContracts[networkId].opening_proof.address,
    "TopLevelMerkleProof": deployedProtocolContracts[networkId].TopLevelMerkleProof.address,
    "SubTreeMerkleProof": deployedProtocolContracts[networkId].SubTreeMerkleProof.address,
    "KeccakTreeEntry": deployedProtocolContracts[networkId].KeccakTreeEntry.address,
    "GreaterOrEqualThen": deployedProtocolContracts[networkId].GreaterOrEqualThen.address,
    "SmallerThan": deployedProtocolContracts[networkId].SmallerThan.address,
  }
}
