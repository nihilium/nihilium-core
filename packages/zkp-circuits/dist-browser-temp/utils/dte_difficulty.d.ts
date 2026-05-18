export interface DifficultyEstimate {
    rounds: number;
    threshold: number;
    difficulty: number;
    mpcEcMults: number;
    mpcCommunicationGB: number;
    mpcTransferTimeMinutes1Gbps: number;
    clientEcMults: number;
    clientSealingTimeMs: number;
    clientSealingTimeFormatted: string;
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
export declare function estimateRounds(difficulty: number, threshold: number, poolSize?: number): DifficultyEstimate;
/**
 * Print a comparison table across multiple threshold values for a given difficulty.
 */
export declare function difficultyTable(difficulty: number, configs: {
    k: number;
    n: number;
}[]): void;
