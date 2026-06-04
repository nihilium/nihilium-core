import type { Argv } from "yargs";
import { Contract, JsonRpcProvider, Wallet, ZeroAddress, isAddress } from "ethers";
import {
  processorRegistryAbi,
  datastreamRegistryAbi,
  registryContracts,
} from "@nihilium/registry";
import { getChainId, getRpcUrl } from "../config";
import {
  printError,
  printInfo,
  printRegistryStakeList,
  printSpinner,
  type RegistryStakeListRow,
} from "../ui/output";

type ProcessorInfoTuple = [bigint, bigint, bigint, boolean, [string, string, string, string]];
type DatastreamInfoTuple = [string, bigint, bigint, bigint, boolean, [string, string, string, string]];
type PendingRemovalTuple = [bigint, bigint];

export const command = "list";
export const describe = "List processors and datastreams with stake and window periods";

export function builder(yargs: Argv): Argv {
  return yargs.option("all", {
    alias: "a",
    type: "boolean",
    default: true,
    describe: "Include inactive operators too",
  });
}

export async function handler(argv: unknown): Promise<void> {
  const stop = printSpinner("Loading processors and datastreams…");
  try {
    const includeInactive = (argv as { all?: boolean }).all ?? true;
    const rows = await loadRegistryStakeRows(includeInactive);
    stop();
    if (rows.length === 0) {
      printInfo("No processors or datastreams found.");
      return;
    }
    printRegistryStakeList(rows);
  } catch (e) {
    stop();
    printError(String(e));
    process.exit(1);
  }
}

async function loadRegistryStakeRows(includeInactive: boolean): Promise<RegistryStakeListRow[]> {
  const chainId = getChainId();
  const rpcUrl = getRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl);

  const processorAddress =
    process.env.PROCESSOR_REGISTRY_ADDRESS ?? registryContracts[chainId]?.processorRegistry;
  const datastreamAddress =
    process.env.DATASTREAM_REGISTRY_ADDRESS ?? registryContracts[chainId]?.datastreamRegistry;

  const rows: RegistryStakeListRow[] = [];
  const skipReasons: string[] = [];

  if (isAddress(processorAddress) && isHexPrivateKey(process.env.PROCESSOR_PRIVATE_KEY)) {
    const signer = new Wallet(process.env.PROCESSOR_PRIVATE_KEY!, provider);
    const processorContract = new Contract(processorAddress, processorRegistryAbi, signer);
    rows.push(...await loadProcessorRows(processorContract, includeInactive, signer.address));
  } else {
    skipReasons.push("processor (set valid PROCESSOR_REGISTRY_ADDRESS and PROCESSOR_PRIVATE_KEY)");
  }

  if (isAddress(datastreamAddress) && isHexPrivateKey(process.env.DATASTREAM_PRIVATE_KEY)) {
    const signer = new Wallet(process.env.DATASTREAM_PRIVATE_KEY!, provider);
    const datastreamContract = new Contract(datastreamAddress, datastreamRegistryAbi, signer);
    rows.push(...await loadDatastreamRows(datastreamContract, includeInactive));
  } else {
    skipReasons.push("datastream (set valid DATASTREAM_REGISTRY_ADDRESS and DATASTREAM_PRIVATE_KEY)");
  }

  if (rows.length === 0) {
    throw new Error(`No valid registry credentials configured; skipped: ${skipReasons.join(", ")}.`);
  }
  if (skipReasons.length > 0) {
    printInfo(`Skipping ${skipReasons.join(" and ")} due to invalid placeholder values.`);
  }

  return rows;
}

async function loadProcessorRows(
  contract: Contract,
  includeInactive: boolean,
  configuredProcessorAddress: string
): Promise<RegistryStakeListRow[]> {
  const processors = [configuredProcessorAddress.toLowerCase()];

  const tokens = [ZeroAddress];
  const rows: RegistryStakeListRow[] = [];

  for (const processor of processors) {
    const info = await contract.getProcessorInfo(processor) as ProcessorInfoTuple;
    const [gracePeriodSeconds, pendingGracePeriodSeconds, , active, metadata] = info;
    if (!includeInactive && !active) continue;

    for (const token of tokens) {
      const activeStake = await contract.stakes(processor, token) as bigint;
      const pending = await contract.pendingRemovals(processor, token) as PendingRemovalTuple;
      const pendingAmount = pending[0];
      const withdrawableAt = pending[1] === 0n ? 0n : pending[1] + gracePeriodSeconds;

      rows.push({
        kind: "Processor",
        address: processor,
        name: metadata[0],
        active,
        gracePeriodSeconds,
        pendingGracePeriodSeconds,
        token,
        activeStake,
        pendingRemovalAmount: pendingAmount,
        withdrawableAt,
      });
    }
  }

  return rows;
}

function isHexPrivateKey(v: string | undefined): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

async function loadDatastreamRows(contract: Contract, includeInactive: boolean): Promise<RegistryStakeListRow[]> {
  const operators: string[] = await contract.getAllOperators();
  if (operators.length === 0) return [];

  const tokens = [ZeroAddress, ...await contract.getAllowedTokens() as string[]];
  const rows: RegistryStakeListRow[] = [];

  for (const operator of operators) {
    const info = await contract.getDatastreamInfo(operator) as DatastreamInfoTuple;
    const [, gracePeriodSeconds, pendingGracePeriodSeconds, , active, metadata] = info;
    if (!includeInactive && !active) continue;

    for (const token of tokens) {
      const activeStake = await contract.stakes(operator, token) as bigint;
      const pending = await contract.pendingRemovals(operator, token) as PendingRemovalTuple;
      const pendingAmount = pending[0];
      const withdrawableAt = pending[1] === 0n ? 0n : pending[1] + gracePeriodSeconds;

      rows.push({
        kind: "Datastream",
        address: operator,
        name: metadata[0],
        active,
        gracePeriodSeconds,
        pendingGracePeriodSeconds,
        token,
        activeStake,
        pendingRemovalAmount: pendingAmount,
        withdrawableAt,
      });
    }
  }

  return rows;
}
