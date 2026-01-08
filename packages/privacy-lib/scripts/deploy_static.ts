import { ethers as ethersjs } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// Interface for deployed contract data
interface DeployedContract {
    name: string;
    address: string;
    bytecode: string;
    abi: any[];
    contract?: any;
}

// Interface for deployment file format
interface DeploymentData {
    [contractName: string]: {
        address: string;
        bytecode: string;
        abi: any[];
    };
}

// A helper to deploy contracts and log the address
async function deployContract(
    contractName: string,
    factoryName: string,
    deployer: ethersjs.Wallet,
    gasPrice: bigint,
    nonce: number,
    ...args: any[]
): Promise<DeployedContract> {
    console.log(`Deploying ${contractName}...`);
    //const nonce = await deployer.provider?.getTransactionCount(deployer.address, "pending");
    const factory = await (hre as any).ethers.getContractFactory(factoryName, deployer);
    console.log(`Nonce: ${nonce}`);
    // Deploy with explicit gas settings
    const contract = await factory.deploy(...args, {
        gasPrice: gasPrice,
        gasLimit: 6000000,
        nonce: nonce
    });
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    // Get bytecode and ABI from the factory
    const bytecode = factory.bytecode;
    const abi = factory.interface.fragments.map((fragment: any) => fragment);
    
    console.log(`${contractName} deployed to:`, address);
    return { name: contractName, address, bytecode, abi, contract };
}

// A helper to deploy contracts from JSON artifacts
async function deployFromJson(
    contractName: string,
    jsonPath: string,
    deployer: ethersjs.Wallet,
    ...args: any[]
): Promise<DeployedContract> {
    console.log(`Deploying ${contractName} from ${jsonPath}...`);
    const contractJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const factory = new ethersjs.ContractFactory(contractJson.abi, contractJson.bytecode, deployer);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    const bytecode = contractJson.bytecode;
    const abi = contractJson.abi;
    console.log(`${contractName} deployed to:`, address);
    return { name: contractName, address, bytecode, abi, contract };
}

// Helper to get contract bytecode and ABI from Hardhat artifacts
function getContractBytecode(contractPath: string): string {
    const artifactPath = path.join(__dirname, "../artifacts", contractPath + ".json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}`);
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    return artifact.bytecode;
}

// Helper to get contract ABI from Hardhat artifacts
function getContractABI(contractPath: string): any[] {
    const artifactPath = path.join(__dirname, "../artifacts", contractPath + ".json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}`);
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    return artifact.abi;
}

// Helper to load existing deployment data
function loadExistingDeployments(chainId: string): DeploymentData {
    const deploymentFilename = `deployed-contracts-${chainId}.json`;
    const deploymentPath = path.join(__dirname, deploymentFilename);
    
    if (fs.existsSync(deploymentPath)) {
        const existingData = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
        
        // Convert old format to new format if needed
        const deploymentData: DeploymentData = {};
        for (const [name, value] of Object.entries(existingData)) {
            if (typeof value === 'string') {
                // Old format: just addresses - need to fill in missing data
                deploymentData[name] = { address: value, bytecode: "", abi: [] };
            } else if (typeof value === 'object' && value !== null) {
                const existing = value as any;
                // New format: ensure all fields exist
                deploymentData[name] = {
                    address: existing.address || "",
                    bytecode: existing.bytecode || "",
                    abi: existing.abi || []
                };
            }
        }
        
        console.log(`Loaded existing deployments for chain ${chainId}`);
        return deploymentData;
    }
    
    console.log(`No existing deployments found for chain ${chainId}`);
    return {};
}

// Helper to check if contract needs redeployment
function needsRedeployment(contractName: string, newBytecode: string, existingDeployments: DeploymentData): boolean {
    const existing = existingDeployments[contractName];
    if (!existing || !existing.address) {
        console.log(`${contractName}: No existing deployment found - needs deployment`);
        return true;
    }
    
    if (!existing.bytecode || existing.bytecode !== newBytecode) {
        console.log(`${contractName}: Bytecode changed - needs redeployment`);
        return true;
    }
    
    console.log(`${contractName}: Bytecode unchanged - skipping deployment (${existing.address})`);
    return false;
}

async function main() {
    console.log("Starting deployment of static contracts...");

    // Load chain config from chain_config.json
    const configPath = path.resolve(__dirname, "chain_config.json");
    const chainConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log(chainConfig);
    
    // Determine which network to use (default: ganache, or via CLI arg/env)
    let network = "ganache";
    
    // Use positional argument: npm run deploy -- privateKey networkName
    if (process.argv[2] && chainConfig[process.argv[2]]) {
        network = process.argv[2];
    }
    
    // Allow override via env
    if (process.env.DEPLOY_NETWORK && chainConfig[process.env.DEPLOY_NETWORK]) {
        network = process.env.DEPLOY_NETWORK;
    }

    const networkConfig = chainConfig[network];
    if (!networkConfig) {
        throw new Error(`Unknown network: ${network}`);
    }

    const privateKey = process.env.PRIVATE_KEY || process.argv[3] || "0x00c02c2c80ec46a6cbc5ccce6b0ce9e293c46a568cd2ffdfb69315efd7dafa36"; // Ganache default
    console.log(privateKey);
    const rpcUrl = networkConfig.url;
    const chainId = BigInt(networkConfig.chainId);

    const provider = new ethersjs.JsonRpcProvider(rpcUrl, chainId);
    const wallet = new ethersjs.Wallet(privateKey, provider);
    
    // Set gas price for Ganache compatibility  
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethersjs.parseUnits("20", "gwei");
    console.log(`Current gas price: ${gasPrice} wei (${ethersjs.formatUnits(gasPrice, "gwei")} Gwei)`);

    console.log(`Deploying contracts with account: ${wallet.address}`);
    console.log(`Using RPC URL: ${rpcUrl} with Chain ID: ${chainId}`);

    // It's good practice to compile contracts before deployment
    console.log("Compiling contracts with Hardhat...");
    await hre.run("compile", { force: true });
    console.log("Compilation complete.");

    // Load existing deployments
    const existingDeployments = loadExistingDeployments(chainId.toString());
    const deploymentData: DeploymentData = { ...existingDeployments };
//TimeDelayProof
    var nonce = (await wallet.provider?.getTransactionCount(wallet.address, "pending")) || 0;
    // --- DEPLOY VERIFIERS ---
    const verifierConfigs = [
        { name: "TopLevelMerkleProof", artifactPath: "contracts/proofs/TopLevelMerkleProof.sol/TopLevelMerkleProof", contractPath: "contracts/proofs/TopLevelMerkleProof.sol:TopLevelMerkleProof" },
        { name: "SubTreeMerkleProof", artifactPath: "contracts/proofs/SubTreeMerkleProof.sol/SubTreeMerkleProof", contractPath: "contracts/proofs/SubTreeMerkleProof.sol:SubTreeMerkleProof" },
        { name: "KeccakTreeEntry", artifactPath: "contracts/proofs/KeccakTreeEntry.sol/KeccakTreeEntry", contractPath: "contracts/proofs/KeccakTreeEntry.sol:KeccakTreeEntry" },
        { name: "GreaterOrEqualThen", artifactPath: "contracts/proofs/GreaterOrEqualThen.sol/GreaterOrEqualThen", contractPath: "contracts/proofs/GreaterOrEqualThen.sol:GreaterOrEqualThen" },
        { name: "SmallerThan", artifactPath: "contracts/proofs/SmallerThan.sol/SmallerThan", contractPath: "contracts/proofs/SmallerThan.sol:SmallerThan" },
        { name: "TimeDelayProof", artifactPath: "contracts/proofs/TimeDelayProof.sol/TimeDelayProof", contractPath: "contracts/proofs/TimeDelayProof.sol:TimeDelayProof" },
       // { name: "ZKPassport_7", artifactPath: "contracts/proofs/ZKPassport_7.sol/ZKPassport_7", contractPath: "contracts/proofs/ZKPassport_7.sol:ZKPassport_7" },
       // { name: "generic_adjacent_tree_proof", artifactPath: "contracts/generic_adjacent_tree_proof.sol/BaseHonkVerifier", contractPath: "contracts/generic_adjacent_tree_proof.sol:BaseHonkVerifier" },
        //{ name: "generic_tree_proof", artifactPath: "contracts/generic_tree_proof.sol/BaseHonkVerifier", contractPath: "contracts/generic_tree_proof.sol:BaseHonkVerifier" },
        // { name: "sub_tree_merkle_proof", artifactPath: "contracts/decomissioned/sub_tree_merkle_proof.sol/sub_tree_merkle_proof", contractPath: "contracts/decomissioned/sub_tree_merkle_proof.sol:sub_tree_merkle_proof" },
        // { name: "top_level_merkle_proof", artifactPath: "contracts/decomissioned/top_level_merkle_proof.sol/top_level_merkle_proof", contractPath: "contracts/decomissioned/top_level_merkle_proof.sol:top_level_merkle_proof" },
        { name: "opening_proof", artifactPath: "contracts/proofs/opening_proof.sol/opening_proof", contractPath: "contracts/proofs/opening_proof.sol:opening_proof" },
        // { name: "validated_sig_he_add", artifactPath: "contracts/proofs/validated_sig_he_add.sol/validated_sig_he_add", contractPath: "contracts/proofs/validated_sig_he_add.sol:validated_sig_he_add" },
    ];

    const verifierAddresses: { [name: string]: string } = {};

    for (const config of verifierConfigs) {
        const contractBytecode = getContractBytecode(config.artifactPath);
        
        if (needsRedeployment(config.name, contractBytecode, existingDeployments)) {
            const verifier = await deployContract(config.name, config.contractPath, wallet, gasPrice, nonce);
            deploymentData[verifier.name] = {
                address: verifier.address,
                bytecode: verifier.bytecode,
                abi: verifier.abi
            };
            verifierAddresses[config.name] = verifier.address;
            nonce++;
        } else {
            // If ABI is missing from existing deployment, add it
            const existing = existingDeployments[config.name];
            if (!existing.abi || existing.abi.length === 0) {
                existing.abi = getContractABI(config.artifactPath);
                deploymentData[config.name] = existing;
            }
            verifierAddresses[config.name] = existing.address;
        }
    }

    // --- DEPLOY CORE CONTRACTS ---
    
    // EmpheralMerkleTreeKeccak
    const empheralName = "EmpheralMerkleTreeKeccak";
    const empheralBytecode = getContractBytecode(`contracts/${empheralName}.sol/${empheralName}`);
    if (needsRedeployment(empheralName, empheralBytecode, existingDeployments)) {
        const empheralMerkleTree = await deployContract(empheralName, `contracts/${empheralName}.sol:${empheralName}`, wallet, gasPrice, nonce, wallet.address, 24);
        deploymentData[empheralMerkleTree.name] = {
            address: empheralMerkleTree.address,
            bytecode: empheralMerkleTree.bytecode,
            abi: empheralMerkleTree.abi
        };
        nonce++;
    } else if (!existingDeployments[empheralName].abi || existingDeployments[empheralName].abi.length === 0) {
        existingDeployments[empheralName].abi = getContractABI(`contracts/${empheralName}.sol/${empheralName}`);
        deploymentData[empheralName] = existingDeployments[empheralName];
    }

    // // SubTreeMerkleProof
    // const subTreeName = "SubTreeMerkleProof";
    // const subTreeBytecode = getContractBytecode(`contracts/proofs/${subTreeName}.sol/${subTreeName}`);
    // if (needsRedeployment(subTreeName, subTreeBytecode, existingDeployments)) {
    //     const subTreeMerkleTree = await deployContract(subTreeName, `contracts/proofs/${subTreeName}.sol:${subTreeName}`, wallet, gasPrice);
    //     deploymentData[subTreeMerkleTree.name] = {
    //         address: subTreeMerkleTree.address,
    //         bytecode: subTreeMerkleTree.bytecode,
    //         abi: subTreeMerkleTree.abi
    //     };
    // } else if (!existingDeployments[subTreeName].abi || existingDeployments[subTreeName].abi.length === 0) {
    //     existingDeployments[subTreeName].abi = getContractABI(`contracts/proofs/${subTreeName}.sol/${subTreeName}`);
    //     deploymentData[subTreeName] = existingDeployments[subTreeName];
    // }

    // // TopLevelMerkleProof
    // const topLevelName = "TopLevelMerkleProof";
    // const topLevelBytecode = getContractBytecode(`contracts/proofs/${topLevelName}.sol/${topLevelName}`);
    // if (needsRedeployment(topLevelName, topLevelBytecode, existingDeployments)) {
    //     const topLevelMerkleTree = await deployContract(topLevelName, `contracts/proofs/${topLevelName}.sol:${topLevelName}`, wallet, gasPrice);
    //     deploymentData[topLevelMerkleTree.name] = {
    //         address: topLevelMerkleTree.address,prfs
    // } else if (!existingDeployments[topLevelName].abi || existingDeployments[topLevelName].abi.length === 0) {
    //     existingDeployments[topLevelName].abi = getContractABI(`contracts/proofs/${topLevelName}.sol/${topLevelName}`);
    //     deploymentData[topLevelName] = existingDeployments[topLevelName];
    // }

    // ChainedProof
    const chainedProofName = "ChainedProof";
    const chainedProofBytecode = getContractBytecode(`contracts/${chainedProofName}.sol/${chainedProofName}`);
    if (needsRedeployment(chainedProofName, chainedProofBytecode, existingDeployments)) {
        // We need to provide two verifier addresses for ChainedProof.
        // We'll use validated_sig_he_add for both as a default. This can be changed later.
        const chainedProof = await deployContract(
            chainedProofName,
            `contracts/${chainedProofName}.sol:${chainedProofName}`,
            wallet,
            gasPrice,
            nonce,
            verifierAddresses["opening_proof"],
            verifierAddresses["opening_proof"]
        );
        deploymentData[chainedProof.name] = {
            address: chainedProof.address,
            bytecode: chainedProof.bytecode,
            abi: chainedProof.abi
        };
    } else if (!existingDeployments[chainedProofName].abi || existingDeployments[chainedProofName].abi.length === 0) {
        existingDeployments[chainedProofName].abi = getContractABI(`contracts/${chainedProofName}.sol/${chainedProofName}`);
        deploymentData[chainedProofName] = existingDeployments[chainedProofName];
    }

    // // KeccakTreeEntry
    // const keccakTreeEntryName = "KeccakTreeEntry";
    // const keccakTreeEntryBytecode = getContractBytecode(`contracts/${keccakTreeEntryName}.sol/${keccakTreeEntryName}`);
    // if (needsRedeployment(keccakTreeEntryName, keccakTreeEntryBytecode, existingDeployments)) {
    //     const keccakTreeEntry = await deployContract(keccakTreeEntryName, `contracts/${keccakTreeEntryName}.sol:${keccakTreeEntryName}`, wallet, gasPrice);
    //     deploymentData[keccakTreeEntry.name] = {
    //         address: keccakTreeEntry.address,
    //         bytecode: keccakTreeEntry.bytecode,
    //         abi: keccakTreeEntry.abi
    //     };
    // } else if (!existingDeployments[keccakTreeEntryName].abi || existingDeployments[keccakTreeEntryName].abi.length === 0) {
    //     existingDeployments[keccakTreeEntryName].abi = getContractABI(`contracts/${keccakTreeEntryName}.sol/${keccakTreeEntryName}`);
    //     deploymentData[keccakTreeEntryName] = existingDeployments[keccakTreeEntryName];
    // }

    // // GreaterOrEqualThen
    // const greaterOrEqualThenName = "GreaterOrEqualThen";
    // const greaterOrEqualThenBytecode = getContractBytecode(`contracts/${greaterOrEqualThenName}.sol/${greaterOrEqualThenName}`);
    // if (needsRedeployment(greaterOrEqualThenName, greaterOrEqualThenBytecode, existingDeployments)) {
    //     const greaterOrEqualThen = await deployContract(greaterOrEqualThenName, `contracts/${greaterOrEqualThenName}.sol:${greaterOrEqualThenName}`, wallet, gasPrice);
    //     deploymentData[greaterOrEqualThen.name] = {
    //         address: greaterOrEqualThen.address,
    //         bytecode: greaterOrEqualThen.bytecode,
    //         abi: greaterOrEqualThen.abi
    //     };
    // } else if (!existingDeployments[greaterOrEqualThenName].abi || existingDeployments[greaterOrEqualThenName].abi.length === 0) {
    //     existingDeployments[greaterOrEqualThenName].abi = getContractABI(`contracts/${greaterOrEqualThenName}.sol/${greaterOrEqualThenName}`);
    //     deploymentData[greaterOrEqualThenName] = existingDeployments[greaterOrEqualThenName];
    // }

    // //SmallerThan
    // const smallerThanName = "SmallerThan";
    // const smallerThanBytecode = getContractBytecode(`contracts/${smallerThanName}.sol/${smallerThanName}`);
    // if (needsRedeployment(smallerThanName, smallerThanBytecode, existingDeployments)) {
    //     const smallerThan = await deployContract(smallerThanName, `contracts/${smallerThanName}.sol:${smallerThanName}`, wallet, gasPrice);
    //     deploymentData[smallerThan.name] = {
    //         address: smallerThan.address,
    //         bytecode: smallerThan.bytecode,
    //         abi: smallerThan.abi
    //     };
    // } else if (!existingDeployments[smallerThanName].abi || existingDeployments[smallerThanName].abi.length === 0) {
    //     existingDeployments[smallerThanName].abi = getContractABI(`contracts/${smallerThanName}.sol/${smallerThanName}`);
    //     deploymentData[smallerThanName] = existingDeployments[smallerThanName];
    // }

    // //EqualTo
    // const equalToName = "EqualTo";
    // const equalToBytecode = getContractBytecode(`contracts/${equalToName}.sol/${equalToName}`);
    // if (needsRedeployment(equalToName, equalToBytecode, existingDeployments)) {
    //     const equalTo = await deployContract(equalToName, `contracts/${equalToName}.sol:${equalToName}`, wallet, gasPrice);
    //     deploymentData[equalTo.name] = {
    //         address: equalTo.address,
    //         bytecode: equalTo.bytecode,
    //         abi: equalTo.abi
    //     };
    // } else if (!existingDeployments[equalToName].abi || existingDeployments[equalToName].abi.length === 0) {
    //     existingDeployments[equalToName].abi = getContractABI(`contracts/${equalToName}.sol/${equalToName}`);
    //     deploymentData[equalToName] = existingDeployments[equalToName];
    // }

    // //NotEqualTo
    // const notEqualToName = "NotEqualTo";
    // const notEqualToBytecode = getContractBytecode(`contracts/${notEqualToName}.sol/${notEqualToName}`);
    // if (needsRedeployment(notEqualToName, notEqualToBytecode, existingDeployments)) {
    //     const notEqualTo = await deployContract(notEqualToName, `contracts/${notEqualToName}.sol:${notEqualToName}`, wallet, gasPrice);
    //     deploymentData[notEqualTo.name] = {
    //         address: notEqualTo.address,
    //         bytecode: notEqualTo.bytecode,
    //         abi: notEqualTo.abi
    //     };
    // } else if (!existingDeployments[notEqualToName].abi || existingDeployments[notEqualToName].abi.length === 0) {
    //     existingDeployments[notEqualToName].abi = getContractABI(`contracts/${notEqualToName}.sol/${notEqualToName}`);
    //     deploymentData[notEqualToName] = existingDeployments[notEqualToName];
    // }

    // Convert back to simpler format for display
    const displayData: { [name: string]: string } = {};
    for (const [name, data] of Object.entries(deploymentData)) {
        displayData[name] = data.address;
    }
    console.log(JSON.stringify(displayData, null, 2));

    const deploymentFilename = `deployed-contracts-${chainId}.json`;
    fs.writeFileSync(
        path.join(__dirname, deploymentFilename),
        JSON.stringify(deploymentData, null, 2)
    );
    console.log(`\nDeployment data saved to ${deploymentFilename} in privacy-lib/scripts/`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
