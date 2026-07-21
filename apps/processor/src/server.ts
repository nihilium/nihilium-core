import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router as apiRouter } from './routes/api';
import { Processor, deployedProtocolContracts, NETWORK_IDS } from '@nihilium/core';
import { ORDER } from '@nihilium/registry';
import { buildPaymentVerifier } from './payment';
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

// Ensures a Baby Jubjub private key is a valid scalar in the base-point
// subgroup: 1 <= key < ORDER (ORDER is the prime subgroup order from
// @nihilium/registry). Throws with the env var name/index on failure.
function assertWithinBjjOrder(key: string, label: string): void {
  let scalar: bigint;
  try {
    scalar = BigInt(key.startsWith('0x') ? key : `0x${key}`);
  } catch {
    throw new Error(`${label} is not a valid hex private key.`);
  }
  if (scalar <= 0n || scalar >= ORDER) {
    throw new Error(
      `${label} is out of range: Baby Jubjub private keys must satisfy 1 <= key < ${ORDER}.`
    );
  }
}

// Parses a comma-separated list of BJJ keys, validating every entry against the
// subgroup order. registry-manager stores these as lists; the node uses the first.
function parseBjjKeyList(raw: string | undefined, label: string): string[] {
  const keys = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  keys.forEach((key, i) => assertWithinBjjOrder(key, `${label}[${i}]`));
  return keys;
}

async function main() {
  // Unified env names (PROCESSOR_*), shared with registry-manager. No legacy
  // fallbacks: the process fails if the expected variable is not set.
  const envProcessorPrivateKey = process.env.PROCESSOR_PRIVATE_KEY;
  const signingKeys = parseBjjKeyList(process.env.PROCESSOR_SIGNING_PRIVATE_KEYS, 'PROCESSOR_SIGNING_PRIVATE_KEYS');
  const heKeys = parseBjjKeyList(process.env.PROCESSOR_HE_PRIVATE_KEYS, 'PROCESSOR_HE_PRIVATE_KEYS');
  const envSigningPrivateKey = signingKeys[0];
  const envHePrivateKey = heKeys[0];

  const argv = await yargs(hideBin(process.argv))
        .option('processor-private-key', {
            alias: 'ppk',
            type: 'string',
            description: 'Private key for the processor wallet',
            required: !envProcessorPrivateKey,
        })
        .option('private-key-signing', {
            alias: 'pk',
            type: 'string',
            description: 'Private key for the wallet',
            required: !envSigningPrivateKey,
        })
        .option('private-key-private-he', {
            alias: 'pkhe',
            type: 'string',
            description: 'Private key for the wallet',
            required: !envHePrivateKey,
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

    const processorPrivateKey = (argv.processorPrivateKey || envProcessorPrivateKey) as string;
    const privateKey = (argv.privateKey || envSigningPrivateKey) as string;
    const privateKeyHE = (argv.privateKeyHE || envHePrivateKey) as string;
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

  // Validate the resolved BJJ keys (covers keys supplied via CLI, not just env).
  assertWithinBjjOrder(privateKey, 'processor signing private key');
  assertWithinBjjOrder(privateKeyHE, 'processor HE private key');

  console.log(chainId, rpcUrl, contractAddress);
  
  // Create a custom network for any chain ID. Mark it as a static network so
  // ethers trusts the configured chain id instead of performing an eth_chainId
  // roundtrip (and throwing "network changed") on every getNetwork() call.
  const network = new Network('custom', chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
  const wallet = new ethers.Wallet(processorPrivateKey, provider);

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
  const paymentVerifier = buildPaymentVerifier(process.env, wallet.address);
  if (paymentVerifier) {
    console.log(`Payment verification enabled (${paymentVerifier.name}), processor ID: ${wallet.address}`);
    app.locals.paymentVerifier = paymentVerifier;
  } else {
    console.warn('Payment verification disabled — NIHILIUM_JWKS_URL not set');
  }
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
