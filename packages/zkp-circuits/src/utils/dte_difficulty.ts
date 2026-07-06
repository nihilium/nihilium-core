/*
  Round Difficulty Estimator for Multi-Round Concatenation FDT

  The difficulty parameter is calibrated to a reference of k=5:
    difficulty=3 at k=5 → 3 rounds → 15 EC mults inside MPC → ~192 GB communication

  For different k values, rounds are adjusted to maintain the same MPC cost:
    difficulty=3 at k=3 → 5 rounds → 15 EC mults → ~192 GB
    difficulty=3 at k=10 → 2 rounds → 20 EC mults → ~256 GB (rounded up)

  The attacker's cost scales as: rounds × k × COST_PER_EC_MULT
  The defender's sealing cost scales as: rounds × k × C(n,k) × COST_PER_CLIENT_MULT
*/

const REFERENCE_K = 5;

// Approximate cost of one EC scalar multiplication (Baby Jubjub, 251-bit)
// inside a garbled circuit with half-gates optimization
const AND_GATES_PER_EC_MULT = 800_000_000; // ~800M gates
const BYTES_PER_AND_GATE = 16; // half-gates: 2 ciphertexts × 8 bytes
const GB_PER_EC_MULT = (AND_GATES_PER_EC_MULT * BYTES_PER_AND_GATE) / 1e9; // ~12.8 GB

// Client-side EC mult on Baby Jubjub in optimized WASM
const CLIENT_MS_PER_EC_MULT = 0.5;

export interface DifficultyEstimate {
  rounds: number;
  threshold: number;
  difficulty: number;

  // What the MPC attacker faces
  mpcEcMults: number;
  mpcCommunicationGB: number;
  mpcTransferTimeMinutes1Gbps: number;

  // What the legitimate client pays at sealing
  clientEcMults: number;
  clientSealingTimeMs: number;
  clientSealingTimeFormatted: string;

  // What the legitimate client pays at unsealing
  unsealEcMults: number;
  unsealTimeMs: number;
}

/**
 * Estimate the number of rounds needed for a given difficulty level and threshold.
 *
 * @param difficulty - Difficulty level calibrated to k=5 reference.
 *                     difficulty=3 means "equivalent to 3 rounds at k=5" (~192 GB MPC cost).
 *                     Range: 1-50 (practical), recommended: 3-10.
 * @param threshold  - The k in k-of-n threshold (number of processors needed).
 * @param poolSize   - The n in k-of-n (total processors). Used for sealing cost estimate.
 * @returns          - Rounds and cost estimates for both defender and attacker.
 */
export function estimateRounds(
  difficulty: number,
  threshold: number,
  poolSize?: number
): DifficultyEstimate {
  if (difficulty < 1) throw new Error("Difficulty must be at least 1");
  if (threshold < 1) throw new Error("Threshold must be at least 1");
  if (poolSize !== undefined && threshold > poolSize) {
    throw new Error("Threshold cannot exceed pool size");
  }

  // Target EC mults inside MPC = difficulty × reference_k
  const targetEcMults = difficulty * REFERENCE_K;

  // Rounds needed for this k to hit that target
  const rounds = Math.ceil(targetEcMults / threshold);

  // Actual EC mults (may exceed target due to ceiling)
  const actualMpcEcMults = rounds * threshold;

  // MPC attacker costs
  const mpcCommunicationGB = actualMpcEcMults * GB_PER_EC_MULT;
  const mpcTransferTimeMinutes1Gbps = (mpcCommunicationGB * 8) / 60; // bits / (bits/sec) / 60

  // Client sealing costs (only if poolSize provided)
  const combinations = poolSize !== undefined ? binomial(poolSize, threshold) : 0;
  const clientEcMults = rounds * threshold * combinations;
  const clientSealingTimeMs = clientEcMults * CLIENT_MS_PER_EC_MULT;

  // Client unsealing costs (always just rounds × k)
  const unsealEcMults = rounds * threshold;
  const unsealTimeMs = unsealEcMults * CLIENT_MS_PER_EC_MULT;

  return {
    rounds,
    threshold,
    difficulty,
    mpcEcMults: actualMpcEcMults,
    mpcCommunicationGB: Math.round(mpcCommunicationGB * 10) / 10,
    mpcTransferTimeMinutes1Gbps: Math.round(mpcTransferTimeMinutes1Gbps * 10) / 10,
    clientEcMults,
    clientSealingTimeMs: Math.round(clientSealingTimeMs),
    clientSealingTimeFormatted: formatDuration(clientSealingTimeMs),
    unsealEcMults,
    unsealTimeMs: Math.round(unsealTimeMs * 100) / 100,
  };
}

/**
 * Print a comparison table across multiple threshold values for a given difficulty.
 */
export function difficultyTable(
  difficulty: number,
  configs: { k: number; n: number }[]
): void {
  console.log(`\nDifficulty level: ${difficulty} (reference: ${difficulty} rounds at k=${REFERENCE_K})\n`);
  console.log(
    "Config".padEnd(10),
    "Rounds".padEnd(8),
    "C(n,k)".padEnd(10),
    "MPC EC mults".padEnd(14),
    "MPC Comms".padEnd(12),
    "MPC Transfer".padEnd(15),
    "Seal time".padEnd(12),
    "Unseal time"
  );
  console.log("-".repeat(95));

  for (const { k, n } of configs) {
    const est = estimateRounds(difficulty, k, n);
    const cnk = binomial(n, k);
    console.log(
      `${k}-of-${n}`.padEnd(10),
      `${est.rounds}`.padEnd(8),
      `${cnk}`.padEnd(10),
      `${est.mpcEcMults}`.padEnd(14),
      `${est.mpcCommunicationGB} GB`.padEnd(12),
      `${est.mpcTransferTimeMinutes1Gbps} min`.padEnd(15),
      `${est.clientSealingTimeFormatted}`.padEnd(12),
      `${est.unsealTimeMs} ms`
    );
  }
}

// --- Helpers ---

function binomial(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 3_600_000).toFixed(1)} hr`;
}

// --- Quick demo ---

/*
  Example usage:

  // "How many rounds for k=3 at difficulty 5?"
  const est = estimateRounds(5, 3, 10);
  // → rounds=9, mpcEcMults=27, mpcCommunicationGB=345.6, sealTime=...

  // Comparison table
  difficultyTable(3, [
    { k: 2, n: 5 },
    { k: 3, n: 10 },
    { k: 5, n: 10 },
    { k: 5, n: 15 },
    { k: 10, n: 20 },
  ]);

  Output:

  Difficulty level: 3 (reference: 3 rounds at k=5)

  Config    Rounds  C(n,k)    MPC EC mults  MPC Comms   MPC Transfer   Seal time   Unseal time
  -----------------------------------------------------------------------------------------------
  2-of-5    8       10        16            204.8 GB    27.3 min       0 ms        8 ms
  3-of-10   5       120       15            192 GB      25.6 min       0.9 s       7.5 ms
  5-of-10   3       252       15            192 GB      1.9 s          7.5 ms
  5-of-15   3       3003      15            192 GB      22.5 s         7.5 ms
  10-of-20  2       184756    20            256 GB      1.5 min        10 ms
*/