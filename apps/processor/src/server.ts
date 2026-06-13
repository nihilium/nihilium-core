import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router as apiRouter } from './routes/api';
import { Processor, deployedProtocolContracts, NETWORK_IDS } from '@nihilium/core';
//Only for debugging purposes
//import { Processor, deployedProtocolContracts, NETWORK_IDS } from '../../../packages/privacy-lib/src/index';
//import { Processor, deployedProtocolContracts, NETWORK_IDS } from '@nihilium/core/src/index';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ethers, Network } from 'ethers';
import { createEvidenceStore } from './evidence';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
async function main() {

  const argv = await yargs(hideBin(process.argv))
        .option('private-key-signing', {
            alias: 'pk',
            type: 'string',
            description: 'Private key for the wallet',
            required: !process.env.PRIVATE_KEY,
        })
        .option('private-key-private-he', {
            alias: 'pk',
            type: 'string',
            description: 'Private key for the wallet',
            required: !process.env.PRIVATE_KEY_HE,
        })
        .option('contract-address', {
            alias: 'ca',
            type: 'string',
            description: 'Datastream contract address',
            required: !process.env.CHAINED_PROOF_CONTRACT_ADDRESS,
        })
        .option('rpc-url', {
            alias: 'rpc',
            type: 'string',
            description: 'RPC URL for the Ethereum node',
            required: !process.env.RPC_URL,
        })
        .option('port', {
            alias: 'p',
            type: 'number',
            description: 'Port to run the server on',
            default: 3005,
        })
        .option('chain-id', {
            alias: 'cid',
            type: 'number',
            description: 'Chain ID for the Ethereum node',
            required: !process.env.CHAIN_ID,
        }).argv;

    const privateKey = (argv.privateKey || process.env.PRIVATE_KEY) as string;
    const privateKeyHE = (argv.privateKeyHE || process.env.PRIVATE_KEY_HE) as string;
    const chainId = (argv.chainId || process.env.CHAIN_ID || 1337) as number;  
    const contractAddress = deployedProtocolContracts[chainId]["ChainedProofV2"]?.address as string;
    const openingProofAddress = deployedProtocolContracts[chainId]["opening_proof"]?.address as string;
    // const rpcUrl = (argv.rpcUrl || process.env.RPC_URL) as string;
    // const chainId = (argv.chainId || process.env.CHAIN_ID || 1337) as number;
    // const port = (argv.port || process.env.PORT || 3005) as number;
  // Load environment variables
  
  const rpcUrl = (argv.rpcUrl || process.env.RPC_URL) as string;
  
  const port = (argv.port || process.env.PORT || 3006) as number;

  if (!privateKey || !contractAddress || !rpcUrl) {
      throw new Error("Missing required configuration: private key, contract address, or RPC URL.");
  }
  console.log(chainId, rpcUrl, contractAddress);
  
  // Create a custom network for any chain ID
  const network = new Network('custom', chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl, network);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Create Express app


  // Middleware
  app.use(cors({ origin: '*' })); // Allow all origins
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));  
   // Parse URL-encoded bodies
  app.locals.processor = new Processor(
    privateKey, 
    privateKeyHE,     
    contractAddress, 
    openingProofAddress, 
    wallet);
    await app.locals.processor.initialize();
  app.locals.evidenceStore = await createEvidenceStore();
  console.log(`Evidence store quorum: ${app.locals.evidenceStore.quorumLabel}`);
  // Routes
  app.use('/', apiRouter);

  // Allow larger POST requests by increasing the body size limit


  const healthStrict = process.env.EVIDENCE_HEALTH_STRICT === 'true';

  // Health check endpoint
  app.get('/health', async (req, res) => {
    const evidence = await app.locals.evidenceStore.checkHealth();
    const payload = {
      status: evidence.healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      evidence,
    };
    if (healthStrict && !evidence.healthy) {
      res.status(503).json(payload);
      return;
    }
    res.status(200).json(payload);
  });

  // Start server
  app.listen(port, () => {
    console.log(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  });

  return app;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
