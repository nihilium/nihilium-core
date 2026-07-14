import { ethers as ethersjs } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

interface DeploymentEntry {
    address: string;
    abi?: any[];
}

interface DeploymentData {
    [contractName: string]: DeploymentEntry;
}

/**
 * Same contract set as deploy_static.ts. `contract` is the Hardhat FQN used for verification.
 */
const CONTRACTS: {
    name: string;
    contract: string;
    /** Optional: resolve constructor args from on-chain state / deployment JSON */
    getConstructorArgs?: (
        address: string,
        deployments: DeploymentData,
        provider: ethersjs.Provider
    ) => Promise<any[]>;
}[] = [
    { name: "TopLevelMerkleProof", contract: "contracts/proofs/TopLevelMerkleProof.sol:TopLevelMerkleProof" },
    { name: "MerkleTreeProof", contract: "contracts/proofs/MerkleTreeProof.sol:MerkleTreeProof" },
    { name: "KeccakTreeEntry", contract: "contracts/proofs/KeccakTreeEntry.sol:KeccakTreeEntry" },
    { name: "GreaterOrEqualThen", contract: "contracts/proofs/GreaterOrEqualThen.sol:GreaterOrEqualThen" },
    { name: "SmallerThan", contract: "contracts/proofs/SmallerThan.sol:SmallerThan" },
    { name: "TimeDelayProof", contract: "contracts/proofs/TimeDelayProof.sol:TimeDelayProof" },
    { name: "VerifyEDDSA", contract: "contracts/proofs/VerifyEDDSA.sol:VerifyEDDSA" },
    { name: "VerifyECDSA", contract: "contracts/proofs/VerifyECDSA.sol:VerifyECDSA" },
    { name: "AdditionProof", contract: "contracts/proofs/AdditionProof.sol:AdditionProof" },
    { name: "ManualChoice", contract: "contracts/proofs/ManualChoice.sol:ManualChoice" },
    { name: "ValueInjection", contract: "contracts/proofs/ValueInjection.sol:ValueInjection" },
    { name: "Poseidon2Verifier", contract: "contracts/proofs/Poseidon2.sol:Poseidon2Verifier" },
    { name: "opening_proof", contract: "contracts/proofs/opening_proof.sol:opening_proof" },
    { name: "hash_tie", contract: "contracts/proofs/hash_tie.sol:hash_tie" },
    { name: "zk_email_proof", contract: "contracts/proofs/EmailSendVerifier.sol:email_send_no_body" },
    {
        name: "EmpheralDualMerkleTreeKeccak",
        contract: "contracts/EmpheralDualMerkleTreeKeccak.sol:EmpheralDualMerkleTreeKeccak",
        getConstructorArgs: async (address, _deployments, provider) => {
            const c = new ethersjs.Contract(
                address,
                ["function owner() view returns (address)", "function levels() view returns (uint32)"],
                provider
            );
            const [owner, levels] = await Promise.all([c.owner(), c.levels()]);
            // ethers returns uint32 as bigint; hardhat verify expects a number/string
            return [owner, Number(levels)];
        },
    },
    {
        name: "ChainedProofV2",
        contract: "contracts/ChainedProofV2.sol:ChainedProofV2",
        getConstructorArgs: async (address, deployments, provider) => {
            const c = new ethersjs.Contract(
                address,
                [
                    "function public_proof_verifier() view returns (address)",
                    "function forced_opening_verifier() view returns (address)",
                ],
                provider
            );
            try {
                const [publicVerifier, forcedOpening] = await Promise.all([
                    c.public_proof_verifier(),
                    c.forced_opening_verifier(),
                ]);
                return [publicVerifier, forcedOpening];
            } catch {
                // Fallback to deployment file (deploy_static used opening_proof for both)
                const opening = deployments["opening_proof"]?.address;
                if (!opening) {
                    throw new Error("Could not resolve ChainedProofV2 constructor args");
                }
                return [opening, opening];
            }
        },
    },
];

function resolveNetworkName(): string {
    if (process.env.DEPLOY_NETWORK) {
        return process.env.DEPLOY_NETWORK;
    }
    // Positional: hardhat run scripts/verify_static.ts [network]
    // After hardhat's own args; dotenv scripts set DEPLOY_NETWORK instead.
    const configPath = path.resolve(__dirname, "chain_config.json");
    const chainConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    for (const arg of process.argv.slice(2)) {
        if (chainConfig[arg]) {
            return arg;
        }
    }
    // Prefer Hardhat --network when it maps to chain_config
    if (hre.network.name && chainConfig[hre.network.name]) {
        return hre.network.name;
    }
    return "ganache";
}

function loadDeployments(chainId: string): DeploymentData {
    const deploymentPath = path.join(__dirname, `deployed-contracts-${chainId}.json`);
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`Deployment file not found: ${deploymentPath}`);
    }
    return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
}

function isAlreadyVerified(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /already verified/i.test(message);
}

async function verifyOne(
    name: string,
    address: string,
    contract: string,
    constructorArguments: any[]
): Promise<"verified" | "already" | "failed"> {
    console.log(`\nVerifying ${name} at ${address}...`);
    try {
        await hre.run("verify:verify", {
            address,
            contract,
            constructorArguments,
        });
        console.log(`✓ ${name} verified`);
        return "verified";
    } catch (error) {
        if (isAlreadyVerified(error)) {
            console.log(`✓ ${name} already verified`);
            return "already";
        }
        console.error(`✗ ${name} failed:`, error instanceof Error ? error.message : error);
        return "failed";
    }
}

async function main() {
    const configPath = path.resolve(__dirname, "chain_config.json");
    const chainConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const network = resolveNetworkName();
    const networkConfig = chainConfig[network];
    if (!networkConfig) {
        throw new Error(`Unknown network: ${network}`);
    }

    const expectedChainId = Number(networkConfig.chainId);
    const runtimeChainId = Number(await hre.network.provider.send("eth_chainId"));

    if (runtimeChainId !== expectedChainId) {
        throw new Error(
            `Hardhat network chainId (${runtimeChainId}) does not match ${network} (${expectedChainId}). ` +
                `Run with: npx hardhat run scripts/verify_static.ts --network ${network}`
        );
    }

    if (!process.env.ETHERSCAN_API_KEY) {
        console.warn(
            "Warning: ETHERSCAN_API_KEY is not set. Verification will likely fail for Etherscan-based explorers."
        );
    }

    console.log(`Verifying static contracts on ${network} (chainId ${expectedChainId})`);
    console.log(`Hardhat network: ${hre.network.name}`);

    const deployments = loadDeployments(String(expectedChainId));
    const provider = new ethersjs.JsonRpcProvider(networkConfig.url, expectedChainId);

    // Optional filter: VERIFY_ONLY=ChainedProofV2,opening_proof
    const onlyFilter = process.env.VERIFY_ONLY
        ? new Set(process.env.VERIFY_ONLY.split(",").map((s) => s.trim()).filter(Boolean))
        : null;

    const summary = { verified: 0, already: 0, failed: 0, skipped: 0 };

    for (const config of CONTRACTS) {
        if (onlyFilter && !onlyFilter.has(config.name)) {
            continue;
        }

        const entry = deployments[config.name];
        if (!entry?.address) {
            console.log(`\nSkipping ${config.name}: not in deployment file`);
            summary.skipped++;
            continue;
        }

        const constructorArguments = config.getConstructorArgs
            ? await config.getConstructorArgs(entry.address, deployments, provider)
            : [];

        if (constructorArguments.length > 0) {
            console.log(
                `  constructor args: ${JSON.stringify(constructorArguments, (_k, v) =>
                    typeof v === "bigint" ? v.toString() : v
                )}`
            );
        }

        const result = await verifyOne(config.name, entry.address, config.contract, constructorArguments);
        summary[result === "already" ? "already" : result]++;
    }

    console.log("\n--- Verification summary ---");
    console.log(`Verified: ${summary.verified}`);
    console.log(`Already verified: ${summary.already}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Skipped (missing): ${summary.skipped}`);

    if (summary.failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
