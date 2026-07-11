// @ts-ignore
//import deployedContracts1337 from "../scripts/deployed-contracts-1337.json";
// @ts-ignore
import deployedContracts43113 from "../scripts/deployed-contracts-43113.json";
// @ts-ignore
import networkConfig from "../scripts/chain_config.json";
// @ts-ignore
import deployedContractsAnvil from "../scripts/deployed-contracts-31337.json";
// @ts-ignore
import deployedContractsAbritrum from "../scripts/deployed-contracts-42161.json"
// @ts-ignore
import deployedContractsSepolia from "../scripts/deployed-contracts-11155111.json";
import { AddressMap, BasicAddressMap } from "./lib/unseal_conditions/collections/types";

export var NETWORK_IDS = {
  ANVIL: 31337,
  GENANCHE: 1337,
  ARBITRUM: 42161,
  AVAX_TESTNET: 43113,
  SEPOLIA: 11155111,
  CUSTOM: 0,
}

export var deployedProtocolContracts = {
  [NETWORK_IDS.ANVIL]: deployedContractsAnvil,
  //[NETWORK_IDS.GENANCHE]: deployedContracts1337,
  [NETWORK_IDS.AVAX_TESTNET]: deployedContracts43113,
  [NETWORK_IDS.SEPOLIA]: deployedContractsSepolia,
  [NETWORK_IDS.ARBITRUM]: deployedContractsAbritrum,
  [NETWORK_IDS.CUSTOM]: {},
}

//TODO Ugly hardcode, contract is part of the nihilium-zk-email repo
deployedProtocolContracts[NETWORK_IDS.AVAX_TESTNET]["zk_email_proof"] = {
  address: "0x23d1CAfCBD490450176532A9437761f8A503Ff27",
  name: "ZKEmailProof",
  version: "1.0.0",
  description: "A proof that a ZK Email is valid.",
}

deployedProtocolContracts[NETWORK_IDS.SEPOLIA]["zk_email_proof"] = {
  address: "0xc573f97Edc6c74728d6F1596ed1412c34e2E9fF3",
  name: "ZKEmailProof",
  version: "1.0.0",
  description: "A proof that a ZK Email is valid.",
}


deployedProtocolContracts[NETWORK_IDS.ANVIL]["zk_email_proof"] = {
  address: "0x10Bbfc8340BE6eFa09753741d6b838CB495aAd4b",
  name: "ZKEmailProof",
  version: "1.0.0",
  description: "A proof that a ZK Email is valid.",
}

export function toAddressMap(networkId: number): AddressMap {
  if (!deployedProtocolContracts[networkId]) {
    throw new Error(`Network ID ${networkId} not found`);
  }
  
  //loop the deployedProtocolContracts[networkId] and add the address to the BasicAddressMap
  var aaa = Object.keys(deployedProtocolContracts[networkId])
  var addressMap = new BasicAddressMap({});
  for (var i = 0; i < aaa.length; i++) {
    var key = aaa[i];
    //if(key){
      addressMap.addAddress(key, deployedProtocolContracts[networkId][key].address);
    //}
    
  }
  return addressMap;
  // return new BasicAddressMap({
  //   "opening_proof": deployedProtocolContracts[networkId]?.opening_proof?.address,
  //   "TopLevelMerkleProof": deployedProtocolContracts[networkId].TopLevelMerkleProof.address,
  //   "MerkleTreeProof": deployedProtocolContracts[networkId]?.MerkleTreeProof?.address,
  //   "KeccakTreeEntry": deployedProtocolContracts[networkId]?.KeccakTreeEntry?.address,
  //   "GreaterOrEqualThen": deployedProtocolContracts[networkId]?.GreaterOrEqualThen?.address,
  //   "SmallerThan": deployedProtocolContracts[networkId]?.SmallerThan?.address,
  //   "TimeDelayProof": deployedProtocolContracts[networkId]?.TimeDelayProof?.address,
  // });
}
