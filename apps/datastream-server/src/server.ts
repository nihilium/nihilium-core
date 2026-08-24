import express from 'express';
import cors from 'cors';
import {  NETWORK_IDS, deployedProtocolContracts, DataStream, Persistence } from '@nihilium/core';
//import { Processor, deployedProtocolContracts, NETWORK_IDS, DataStream, Persistence } from '../../../packages/privacy-lib/src/index';
// import { EVMDataStreamNonZK} from '@nihilium/core/src/lib/data_stream/EVMDataStreamNonZK';
// import { DataStreamFilePersistence } from '@nihilium/core/src/lib/persistence/DataStreamFilePersistence';
import { ethers, Signer, Network } from 'ethers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'dotenv/config'; 
import { utils } from '@nihilium/core';
import dotenv from 'dotenv';

dotenv.config();

// "avax-testnet": {
//         "url": "https://api.avax-test.network/ext/bc/C/rpc",
//         "chainId": 43113
//     }    

async function main() {
    // Unified env names (DATASTREAM_*) shared with registry-manager. No legacy
    // fallbacks: the process fails if the expected variable is not set.
    const envPrivateKey = process.env.DATASTREAM_PRIVATE_KEY;
    const envContractAddress = process.env.DATASTREAM_CONTRACT_ADDRESS;

    const argv = await yargs(hideBin(process.argv))
        .option('private-key', {
            alias: 'pk',
            type: 'string',
            description: 'Private key for the wallet',
            required: !envPrivateKey,
        })
        .option('contract-address', {
            alias: 'ca',
            type: 'string',
            description: 'Datastream contract address',
            required: !envContractAddress,
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
            default: 3006,
        })
        .option('chain-id', {
            alias: 'cid',
            type: 'number',
            description: 'Chain ID for the Ethereum node',
            required: !process.env.CHAIN_ID,
        })
        .option('publishing-interval', {
            alias: 'pi',
            type: 'number',
            description: 'Publishing interval in seconds',
            default: process.env.PUBLISHING_INTERVAL ? parseInt(process.env.PUBLISHING_INTERVAL) : 10,
        })
        .option('depth', {
            alias: 'd',
            type: 'number',
            description: 'Merkle tree depth',
            default: process.env.DEPTH ? parseInt(process.env.DEPTH) : 20,
        })
        .option('max-local-tree-elements', {
            alias: 'mlte',
            type: 'number',
            description: 'Maximum number of local tree elements (-1 for auto)',
            default: process.env.MAX_LOCAL_TREE_ELEMENTS ? parseInt(process.env.MAX_LOCAL_TREE_ELEMENTS) : -1,
        })
        .option('forced-publication-interval', {
            alias: 'fpi',
            type: 'number',
            description: 'Forced publication interval in seconds',
            default: process.env.FORCED_PUBLICATION_INTERVAL ? parseInt(process.env.FORCED_PUBLICATION_INTERVAL) : 60 * 10,
        }).argv;

    const privateKey = (argv.privateKey || envPrivateKey) as string;
    const contractAddress = (argv.contractAddress || envContractAddress) as string;
    const rpcUrl = (argv.rpcUrl || process.env.RPC_URL) as string;
    const chainId = (argv.chainId || process.env.CHAIN_ID || 1337) as number;
    const port = (argv.port || process.env.PORT || 3006) as number;
    const publishingInterval = argv.publishingInterval as number;
    const depth = argv.depth as number;
    const maxLocalTreeElements = argv.maxLocalTreeElements as number;
    const forcedPublicationInterval = argv.forcedPublicationInterval as number;

    if (!privateKey || !contractAddress || !rpcUrl) {
        throw new Error("Missing required configuration: private key, contract address, or RPC URL.");
    }
    console.log(chainId, rpcUrl, contractAddress);
    
    // Create a custom network for any chain ID
    const network = new Network('custom', chainId);
    const provider = new ethers.JsonRpcProvider(rpcUrl, network);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const dataStreamContract = new ethers.Contract(
        contractAddress,
        [
            "function owner() view returns (address)",
        ],
        wallet
    );

    const owner = await dataStreamContract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error(`Wallet address ${wallet.address} is not the owner of contract ${contractAddress}. The owner is ${owner}.`);
    }

    // This is a placeholder for persistence. In a real application, you would use a proper database.
    const persistence = new Persistence.DataStreamFilePersistence('./server-stream/' + contractAddress, utils.createKeccakMerkelTree);
    

    const dataStream = new DataStream.EVMDataStreamDualMerkleNonZK('server-stream',
         persistence, contractAddress, wallet, publishingInterval, depth, maxLocalTreeElements, forcedPublicationInterval);
    await dataStream.initialize();

    const app = express();
    app.use(cors({ origin: '*' }));
    app.use(express.json());
    
    app.post('/postData', async (req, res) => {
        try {
            const { data } = req.body;
            if (!data || !Array.isArray(data)) {
                return res.status(400).json({ error: 'Invalid data format. "data" should be an array of hex strings.' });
            }
            const result = await dataStream.postData(data);
            res.json({ result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Optional ?from=<unix seconds>: select the earliest publication of the value anchored at or after
    // that time, instead of the earliest publication overall.
    const parseFrom = (raw: unknown): number => {
        const from = parseInt(String(raw ?? ""));
        return Number.isFinite(from) && from > 0 ? from : 0;
    };

    app.get('/proof/:value', async (req, res) => {
        try {
            const { value } = req.params;
            const result = await dataStream.getProof(value, parseFrom(req.query.from));
            result.dualProof.pathElements   = result.dualProof.pathElements.map(e => e.toString());
            result.globalProof.pathElements = result.globalProof.pathElements.map(e => e.toString());
            result.localProof.pathElements  = result.localProof.pathElements.map(e => e.toString());
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/isProvable/:value', async (req, res) => {
        try {
            const { value } = req.params;
            const result = await dataStream.isProvable(value, parseFrom(req.query.from));
            res.json({ result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/globalTreeIndex', (req, res) => {
        const result = dataStream.getGlobalTreeIndex();
        res.json({ result });
    });

    app.get('/latestGlobalLeafProof', async (req, res) => {
        const result = await dataStream.getLatestGlobalLeafProof();
        result.dualProof.pathElements   = result.dualProof.pathElements.map(e => e.toString());
        result.globalProof.pathElements = result.globalProof.pathElements.map(e => e.toString());
        res.json(result);
    });

    app.get('/address', (req, res) => {
        const result = dataStream.getAddress();
        res.json({ result });
    });

    app.get('/identity', (req, res) => {
        
        res.json({ result: {
            address: dataStream.getAddress(),
            chain_id: chainId,
            public_keys: [{address: wallet.address, active: true}],
        } });
    });

    app.get('/health', (req, res) => {
        res.json({ result: 'ok' });
    });
    
    app.listen(port, () => {
        console.log(`Datastream server listening at http://localhost:${port}`);
        console.log(`Connected with wallet address: ${wallet.address}`);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}); 