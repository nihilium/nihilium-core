import express from 'express';
import cors from 'cors';
import {  NETWORK_IDS, deployedProtocolContracts, DataStream, Persistence } from '@nihilium/privacy-lib';
//import { Processor, deployedProtocolContracts, NETWORK_IDS, DataStream, Persistence } from '../../../packages/privacy-lib/src/index';
// import { EVMDataStreamNonZK} from '@nihilium/privacy-lib/src/lib/data_stream/EVMDataStreamNonZK';
// import { DataStreamFilePersistence } from '@nihilium/privacy-lib/src/lib/persistence/DataStreamFilePersistence';
import { ethers, Signer, Network } from 'ethers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import 'dotenv/config'; 
import { utils } from '@nihilium/privacy-lib';
import dotenv from 'dotenv';

dotenv.config();

// "avax-testnet": {
//         "url": "https://api.avax-test.network/ext/bc/C/rpc",
//         "chainId": 43113
//     }

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('private-key', {
            alias: 'pk',
            type: 'string',
            description: 'Private key for the wallet',
            required: !process.env.PRIVATE_KEY,
        })
        .option('contract-address', {
            alias: 'ca',
            type: 'string',
            description: 'Datastream contract address',
            required: !process.env.CONTRACT_ADDRESS,
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
        }).argv;

    const privateKey = (argv.privateKey || process.env.PRIVATE_KEY) as string;
    const contractAddress = (argv.contractAddress || process.env.CONTRACT_ADDRESS) as string;
    const rpcUrl = (argv.rpcUrl || process.env.RPC_URL) as string;
    const chainId = (argv.chainId || process.env.CHAIN_ID || 1337) as number;
    const port = (argv.port || process.env.PORT || 3006) as number;

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
    

    const dataStream = new DataStream.EVMDataStreamNonZK('server-stream', persistence, contractAddress, wallet, 10, 20, -1, 60);
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

    app.get('/proof/:value', async (req, res) => {
        try {
            const { value } = req.params;
            const result = await dataStream.getProof(value);
            result[0].pathElements = result[0].pathElements.map(element => element.toString())
            result[1].pathElements = result[1].pathElements.map(element => element.toString())
            res.json({ globalProof: result[0], localProof: result[1], timestamp: result[2].toString(), globalIndex: result[3], localIndex: result[4] });
        } catch (error: any) {
            const { value } = req.params;
            const result = await dataStream.getProof(value);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/isProvable/:value', async (req, res) => {
        try {
            const { value } = req.params;
            const result = await dataStream.isProvable(value);
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
        const result: any[] = await dataStream.getLatestGlobalLeafProof();
        result[0].pathElements = result[0].pathElements.map(element => element.toString())
        result[2] = result[2].toString()
        result[3] = result[3].toString()
        res.json({ result });
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