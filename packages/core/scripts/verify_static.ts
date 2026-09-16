import { ethers as ethersjs } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
import {
    VERIFIER_CONFIGS, PROXY_CONFIGS, ALIAS_NAMES, ProxyArgRef,
} from "./static_contracts";
dotenv.config();

interface DeploymentEntry {
    address: string;
    abi?: any[];
}

interface DeploymentData {
    [contractName: string]: DeploymentEntry;
}

interface KnownDeployedContracts {
    [contractName: string]: string;
}

/**
 * Contracts whose constructor arguments cannot be written down, because they are only knowable
 * from on-chain state. Everything else is derived from static_contracts.ts below, so the verified
 * set cannot drift from the deployed set.
 */
const INTROSPECTED_ARGS: {
    [name: string]: (
        address: string,
        deployments: DeploymentData,
        provider: ethersjs.Provider,
    ) => Promise<any[]>;
} = {
    EmpheralDualMerkleTreeKeccak: async (address, _deployments, provider) => {
        const c = new ethersjs.Contract(
            address,
            ["function owner() view returns (address)", "function levels() view returns (uint32)"],
            provider,
        );
        const [owner, levels] = await Promise.all([c.owner(), c.levels()]);
        // ethers returns uint32 as bigint; hardhat verify expects a number/string
        return [owner, Number(levels)];
    },
    ChainedProofV2: async (address, deployments, provider) => {
        const c = new ethersjs.Contract(
            address,
            [
                "function public_proof_verifier() view returns (address)",
                "function forced_opening_verifier() view returns (address)",
            ],
            provider,
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
};

/** Hardhat FQNs for the introspected contracts, which are not in the shared config. */
const INTROSPECTED_CONTRACT_PATHS: { [name: string]: string } = {
    EmpheralDualMerkleTreeKeccak: "contracts/EmpheralDualMerkleTreeKeccak.sol:EmpheralDualMerkleTreeKeccak",
    ChainedProofV2: "contracts/ChainedProofV2.sol:ChainedProofV2",
};

type VerifyTarget = {
    name: string;
    contract: string;
    getConstructorArgs?: (
        address: string,
        deployments: DeploymentData,
        provider: ethersjs.Provider,
        getKnownDeployedContracts: () => KnownDeployedContracts,
    ) => Promise<any[]>;
};

/**
 * Resolve a proxy's constructor arguments the same way deploy_static.ts did when it deployed them.
 *
 * Mirrors its resolveRef: "SELECT:<name>" is something this repo deployed, anything else is an
 * externally deployed address from known_deployed_contracts, and a nested array is an address[]
 * argument. Getting this wrong does not fail loudly -- Etherscan just reports a bytecode mismatch.
 */
function resolveProxyArgs(
    args: ProxyArgRef[],
    deployments: DeploymentData,
    getKnownDeployedContracts: () => KnownDeployedContracts,
): any[] {
    const resolveOne = (ref: string): string => {
        if (ref.startsWith("SELECT:")) {
            const name = ref.slice("SELECT:".length);
            const address = deployments[name]?.address;
            if (!address) {
                throw new Error(`Contract ${name} not found in the deployment file`);
            }
            return address;
        }
        const address = getKnownDeployedContracts()[ref];
        if (!address) {
            throw new Error(`Contract ${ref} not found in known_deployed_contracts JSON`);
        }
        return address;
    };
    return args.map((arg) => (Array.isArray(arg) ? arg.map(resolveOne) : resolveOne(arg)));
}

/**
 * The full verification set, built from the same config deploy_static.ts deploys from.
 *
 * Aliases are deliberately absent: they are extra names for one deployment, so verifying them
 * would re-submit the same address under a contract name Etherscan has already accepted.
 */
const CONTRACTS: VerifyTarget[] = [
    ...VERIFIER_CONFIGS.map((config): VerifyTarget => ({
        name: config.name,
        contract: config.contractPath,
    })),
    ...PROXY_CONFIGS.map((config): VerifyTarget => ({
        name: config.name,
        contract: config.contractPath,
        getConstructorArgs: async (_address, deployments, _provider, getKnownDeployedContracts) =>
            resolveProxyArgs(config.args, deployments, getKnownDeployedContracts),
    })),
    ...Object.keys(INTROSPECTED_ARGS).map((name): VerifyTarget => ({
        name,
        contract: INTROSPECTED_CONTRACT_PATHS[name],
        getConstructorArgs: async (address, deployments, provider) =>
            INTROSPECTED_ARGS[name](address, deployments, provider),
    })),
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

function loadKnownDeployedContracts(chainId: string): KnownDeployedContracts {
    const knownPath = path.join(__dirname, `known_deployed_contracts-${chainId}.json`);
    if (!fs.existsSync(knownPath)) {
        throw new Error(`Known deployed contracts file not found: ${knownPath}`);
    }
    return JSON.parse(fs.readFileSync(knownPath, "utf-8"));
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

    // Lazily loaded so the known-contracts file is only required when a contract
    // (e.g. ZKEmailProof) actually needs it to resolve constructor args.
    let knownDeployedContractsCache: KnownDeployedContracts | null = null;
    const getKnownDeployedContracts = (): KnownDeployedContracts => {
        if (!knownDeployedContractsCache) {
            knownDeployedContractsCache = loadKnownDeployedContracts(String(expectedChainId));
        }
        return knownDeployedContractsCache;
    };

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
            ? await config.getConstructorArgs(entry.address, deployments, provider, getKnownDeployedContracts)
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

    // The drift guard. CONTRACTS is derived from static_contracts.ts, so anything sitting in the
    // deployment file that is neither verifiable nor a known alias means the two have diverged --
    // usually a contract added to the deploy without being added to the shared config.
    const covered = new Set(CONTRACTS.map((c) => c.name));
    const unaccounted = Object.keys(deployments)
        .filter((name) => !covered.has(name) && !ALIAS_NAMES.has(name));
    if (unaccounted.length > 0) {
        console.warn(
            `\nWarning: ${unaccounted.length} deployed contract(s) are not in static_contracts.ts ` +
            `and will never be verified:\n  ${unaccounted.join("\n  ")}\n` +
            `Add them to VERIFIER_CONFIGS / PROXY_CONFIGS, or to ALIAS_NAMES if they share an address.`);
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
