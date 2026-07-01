import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
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
    }
  }
};

export default config;
