/**
 * Contract ABIs loaded from Forge build artifacts (`out/`).
 *
 * Run `npm run build:sol` (i.e. `forge build`) before `npm run build:ts`.
 * The top-level `npm run build` script runs both steps in the correct order.
 */

import type { InterfaceAbi } from "ethers";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const processorArtifact  = require("../out/ProcessorRegistry.sol/ProcessorRegistry.json");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const datastreamArtifact = require("../out/DatastreamRegistry.sol/DatastreamRegistry.json");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const conditionArtifact  = require("../out/ConditionVerifierRegistry.sol/ConditionVerifierRegistry.json");

export const processorRegistryAbi:         InterfaceAbi = processorArtifact.abi;
export const datastreamRegistryAbi:        InterfaceAbi = datastreamArtifact.abi;
export const conditionVerifierRegistryAbi: InterfaceAbi = conditionArtifact.abi;
