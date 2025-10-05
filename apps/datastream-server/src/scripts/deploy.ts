import { ethers } from "ethers";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { NETWORK_IDS, deployedProtocolContracts } from "@nihilium/privacy-lib";

dotenv.config();

// "avax-testnet": {
//         "url": "https://api.avax-test.network/ext/bc/C/rpc",
//         "chainId": 43113
//     }
const argv = yargs(hideBin(process.argv))
  .option("rpcUrl", {
    alias: "rpc",
    description: "RPC URL for the Ethereum network",
    type: "string",
    default: process.env.RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
  })
  .option("privateKey", {
    alias: "p",
    description: "Private key for the deploying account",
    type: "string",
    demandOption: !process.env.PRIVATE_KEY,
    default: process.env.PRIVATE_KEY,
  })
  .option("levels", {
    alias: "l",
    description: "Number of levels for the Merkle tree",
    type: "number",
    default: 20,
  })
  
  .option("chainId", {
    alias: "cid",
    description: "Chain ID for the Ethereum network",
    type: "number",
    default: 1337,
  })
  .help()
  .alias("help", "h").argv;

async function main() {
  const { rpcUrl, privateKey, levels, poseidon2Address, chainId } = await argv;

  if (!privateKey) {
    console.error("Error: Private key is required.");
    process.exit(1);
  }
  const _chainId = (chainId|| process.env.CHAIN_ID) as number;
  const provider = new ethers.JsonRpcProvider(rpcUrl, _chainId);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying from account: ${wallet.address}`);

  const artifactsPath = path.resolve(__dirname, "../../../../packages/privacy-lib/artifacts/contracts/DualMerkleTree.sol/DualMerkleTree.json");
  if (!fs.existsSync(artifactsPath)) {
    console.error(`Artifact not found at ${artifactsPath}`);
    console.error("Please compile the contracts in the 'privacy-lib' package first.");
    process.exit(1);
  }

  const { abi, bytecode } = deployedProtocolContracts[_chainId].EmpheralMerkleTreeKeccak; //JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
  console.log("Deploying DualMerkleTree...");
  const contract = await factory.deploy(
    wallet.address,
    levels,
    poseidon2Address
  );

  await contract.waitForDeployment();




  const artifactsPathKeccak = path.resolve(__dirname, "../../../../packages/privacy-lib/artifacts/contracts/DualMerkleTreeKeccak.sol/DualMerkleTreeKeccak.json");
  if (!fs.existsSync(artifactsPathKeccak)) {
    console.error(`Artifact not found at ${artifactsPathKeccak}`);
    console.error("Please compile the contracts in the 'privacy-lib' package first.");
    process.exit(1);
  }

  const { abi: abiKeccak, bytecode: bytecodeKeccak } = JSON.parse(fs.readFileSync(artifactsPathKeccak, "utf8"));
  
  const factoryKeccak = new ethers.ContractFactory(abiKeccak, bytecodeKeccak, wallet);
  
  console.log("Deploying DualMerkleTree...");
  const contractKeccak = await factoryKeccak.deploy(
    wallet.address,
    levels,    
  );

  await contractKeccak.waitForDeployment();

  console.log("DualMerkleTree deployed at:", await contract.getAddress());
  console.log("DualMerkleTreeKeccak deployed at:", await contractKeccak.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 