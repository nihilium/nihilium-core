import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  networks: {
    hardhat: {},
    anvil: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    "avax-testnet": {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
    },
  },
};

export default config;
