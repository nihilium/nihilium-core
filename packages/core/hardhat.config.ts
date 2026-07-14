import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun"
        }
      }
    ],
    overrides: {
      "contracts/EmpheralDualMerkleTreeKeccak.sol": {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "cancun"
        }
      }
    }
  },
  typechain: {
    outDir: "src/typechain-types",
    
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    
  },
  networks: {
    anvil: {
      url: "http://localhost:8545",
      chainId: 31337
    },
    hardhat: {
      chainId: 1337
    },
    ganache: {
      url: "http://localhost:7545",
      chainId: 1337,
      gasPrice: 20000000000, // 20 Gwei
      gas: 6000000
    },
    "avax-testnet": {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    "arbitrum-sepolia": {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.ethpandaops.io",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // Single key uses Etherscan API v2 (multi-chain). Set ETHERSCAN_API_KEY in the env file.
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
