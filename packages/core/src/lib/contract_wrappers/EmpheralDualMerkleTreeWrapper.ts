import { Signer, Transaction, TransactionReceipt, ethers, formatUnits, isError } from "ethers";
import { EmpheralDualMerkleTreeKeccak } from "../../typechain-types";
import { EmpheralDualMerkleTreeKeccak__factory } from "../../typechain-types";

/**
 * The nonce an insert was sent with was consumed by a transaction this wrapper did not send (or no longer
 * remembers, e.g. one from before a restart). The chain state moved under us: the caller has to resync.
 */
export class InsertSupersededError extends Error {
  constructor(nonce: number) {
    super(`Nonce ${nonce} was consumed by a transaction this wrapper did not track`);
    this.name = "InsertSupersededError";
  }
}

export type InsertSendOptions = {
  // How long to wait for a broadcast insert to be mined before re-sending it with higher fees.
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  // Every replacement multiplies both fees by numerator/denominator. Nodes require at least +10%.
  feeBumpNumerator?: bigint;
  feeBumpDenominator?: bigint;
  minPriorityFeeWei?: bigint;
  maxFeePerGasCapWei?: bigint;
  maxBroadcastAttempts?: number;
};

type Fees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

export class EmpheralDualMerkleTreeWrapper {
  private contract!: EmpheralDualMerkleTreeKeccak;
  private signer: Signer;
  private address: string;
  private sendOptions: Required<Omit<InsertSendOptions, "maxFeePerGasCapWei">> & { maxFeePerGasCapWei?: bigint };

  // What was last broadcast, so a retry for the same nonce always outbids it instead of being rejected as an
  // underpriced replacement of our own stuck transaction.
  private pendingNonce: number = -1;
  private pendingFees: Fees | undefined;
  private pendingHashes: string[] = [];

  constructor(signer: Signer, sendOptions: InsertSendOptions = {}) {
    this.signer = signer;
    this.address = "";
    this.sendOptions = {
      waitTimeoutMs: 60_000,
      pollIntervalMs: 3_000,
      feeBumpNumerator: 3n,
      feeBumpDenominator: 2n,
      minPriorityFeeWei: 0n,
      maxBroadcastAttempts: 10,
      ...sendOptions,
    };
  }

  async deploy(levels: number): Promise<void> {
    const factory = new ethers.ContractFactory(
      EmpheralDualMerkleTreeKeccak__factory.abi,
      EmpheralDualMerkleTreeKeccak__factory.bytecode,
      this.signer
    );
    this.contract = (await factory.deploy(
      await this.signer.getAddress(),
      levels
    ) as unknown) as EmpheralDualMerkleTreeKeccak;
    await this.contract.waitForDeployment();
    this.address = await this.contract.getAddress();
    console.log("EmpheralDualMerkleTree deployed at:", this.address);
  }

  async attach(address: string): Promise<void> {
    const factory = new ethers.ContractFactory(
      EmpheralDualMerkleTreeKeccak__factory.abi,
      EmpheralDualMerkleTreeKeccak__factory.bytecode,
      this.signer
    );
    this.contract = factory.attach(address) as EmpheralDualMerkleTreeKeccak;
    this.address = address;
    console.log("EmpheralDualMerkleTree attached at:", address);
  }

  getAddress(): string {
    return this.address;
  }

  async getCurrentIndex(): Promise<bigint> {
    return await this.contract.currentIndex();
  }

  async getLastMerkleRoot(): Promise<string> {
    return await this.contract.getLastMerkleRoot();
  }

  async getLastDualRoot(): Promise<string> {
    return await this.contract.getLastDualRoot();
  }

  async isKnownDualRoot(root: string): Promise<boolean> {
    return await this.contract.isKnownDualRoot(root);
  }

  async insert(
    previousLeaf: string,
    insertValue: string,
    valuePath: string[],
    previousDualLeaf: string,
    previousDualLeafPath: string[]
  ): Promise<{
    index: number;
    timestamp: number;
    blockHash: string;
    newValueRoot: bigint;
    newDualRoot: bigint;
    leafValue: bigint;
    gasUsed: string;
  }> {
    const receipt = await this.sendInsert(previousLeaf, insertValue, valuePath, previousDualLeaf, previousDualLeafPath);
    const gasUsed = receipt.gasUsed?.toString();
    console.log(`Gas used for dual insert: ${gasUsed}`);
    const event = receipt.logs?.find((e) => {
      const parsedLog = this.contract.interface.parseLog(e);
      return parsedLog?.name === "TreeUpdate";
    });
    if (!event) throw new Error("TreeUpdate event not found");
    const parsedLog = this.contract.interface.parseLog(event);
    const index = parsedLog?.args.leafIndex;
    const timestamp = parsedLog?.args.timestamp;
    const blockHash = parsedLog?.args.blockHash;
    const newValueRoot = parsedLog?.args.newValueRoot;
    const newDualRoot = parsedLog?.args.newDualRoot;
    const leafValue = parsedLog?.args.leafValue;
    console.log(`Dual inserted at index: ${index}`);
    return { index, timestamp, blockHash, newValueRoot, newDualRoot, leafValue, gasUsed };
  }

  /**
   * Broadcast an insert and wait for it to be mined, managing nonce and fees explicitly.
   *
   * The insert always targets the lowest unmined nonce, so a transaction stuck in the mempool from an earlier
   * attempt is replaced rather than queued behind. Rejected replacements and slow inclusion both re-send the
   * same nonce with bumped fees; whichever of our transactions for that nonce mines first is the result.
   * Assumes this signer is the only writer for its account.
   */
  private async sendInsert(
    previousLeaf: string,
    insertValue: string,
    valuePath: string[],
    previousDualLeaf: string,
    previousDualLeafPath: string[]
  ): Promise<TransactionReceipt> {
    const provider = this.signer.provider;
    if (!provider) throw new Error("Signer has no provider");
    const from = await this.signer.getAddress();
    const nonce = await provider.getTransactionCount(from, "latest");

    if (nonce !== this.pendingNonce) {
      this.pendingNonce = nonce;
      this.pendingFees = undefined;
      this.pendingHashes = [];
    }

    const populated = await this.contract.insert.populateTransaction(
      previousLeaf, insertValue, valuePath, previousDualLeaf, previousDualLeafPath
    );
    // Fails with CALL_EXCEPTION when the proofs no longer match the chain, which the caller resolves by resyncing.
    const gasEstimate = await provider.estimateGas({ ...populated, from });
    const { chainId } = await provider.getNetwork();
    const baseTx = { ...populated, type: 2, nonce, chainId, gasLimit: (gasEstimate * 12n) / 10n };

    let fees = await this.nextFees();
    let attempts = 0;
    for (;;) {
      if (attempts++ >= this.sendOptions.maxBroadcastAttempts) {
        throw new Error(`Insert at nonce ${nonce} not mined after ${attempts - 1} broadcasts`);
      }

      console.log(`Broadcasting dual insert nonce=${nonce} maxFee=${formatUnits(fees.maxFeePerGas, "gwei")} gwei tip=${formatUnits(fees.maxPriorityFeePerGas, "gwei")} gwei`);
      let hash: string | undefined;
      try {
        hash = await this.broadcast({ ...baseTx, ...fees }, (h) => { hash = h; });
      } catch (error: any) {
        if (isError(error, "REPLACEMENT_UNDERPRICED") || /replacement transaction underpriced|could not replace existing tx/i.test(error?.message ?? "")) {
          // Something of ours (possibly from before a restart) already sits at this nonce with higher fees.
          console.log(`Replacement underpriced at nonce ${nonce}, bumping fees`);
          this.pendingFees = fees;
          fees = await this.nextFees();
          continue;
        }
        if (!isError(error, "NONCE_EXPIRED") && !/already known/i.test(error?.message ?? "")) {
          throw error;
        }
        // Already known: this exact transaction is in the pool. Nonce expired: something mined; the wait
        // below finds out whether it was one of ours.
      }
      this.pendingFees = fees;
      if (hash && !this.pendingHashes.includes(hash)) this.pendingHashes.push(hash);

      const receipt = await this.waitForPendingInsert(nonce, from);
      if (receipt) {
        this.pendingNonce = -1;
        this.pendingFees = undefined;
        this.pendingHashes = [];
        if (receipt.status !== 1) throw new Error(`Dual insert ${receipt.hash} reverted`);
        return receipt;
      }
      console.log(`Dual insert at nonce ${nonce} not mined within ${this.sendOptions.waitTimeoutMs}ms, bumping fees`);
      fees = await this.nextFees();
    }
  }

  /**
   * Sign locally and broadcast the raw transaction, so its hash is known even when the node answers "already
   * known". Signers that cannot sign without sending (Hardhat's) send it themselves. `onHash` reports the hash
   * as soon as it is known, before the broadcast can fail.
   */
  private async broadcast(tx: ethers.TransactionRequest, onHash: (hash: string) => void): Promise<string> {
    let signed: string;
    try {
      signed = await this.signer.signTransaction(tx);
    } catch (error: any) {
      if (!/not ?implemented/i.test(`${error?.name} ${error?.message}`)) throw error;
      const response = await this.signer.sendTransaction(tx);
      return response.hash;
    }
    const hash = Transaction.from(signed).hash!;
    onHash(hash);
    await this.signer.provider!.broadcastTransaction(signed);
    return hash;
  }

  /**
   * Current network fees, but never less than a bump over what was last broadcast for the pending nonce.
   */
  private async nextFees(): Promise<Fees> {
    const feeData = await this.signer.provider!.getFeeData();
    const { feeBumpNumerator: num, feeBumpDenominator: den, minPriorityFeeWei, maxFeePerGasCapWei } = this.sendOptions;

    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
    if (maxPriorityFeePerGas < minPriorityFeeWei) maxPriorityFeePerGas = minPriorityFeeWei;
    let maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    if (maxFeePerGas < maxPriorityFeePerGas) maxFeePerGas = maxPriorityFeePerGas;

    if (this.pendingFees) {
      // +1 so a zero or tiny fee still strictly increases.
      const bumpedTip = (this.pendingFees.maxPriorityFeePerGas * num) / den + 1n;
      const bumpedMax = (this.pendingFees.maxFeePerGas * num) / den + 1n;
      if (maxPriorityFeePerGas < bumpedTip) maxPriorityFeePerGas = bumpedTip;
      if (maxFeePerGas < bumpedMax) maxFeePerGas = bumpedMax;
    }

    if (maxFeePerGasCapWei !== undefined && maxFeePerGas > maxFeePerGasCapWei) {
      if (this.pendingFees && this.pendingFees.maxFeePerGas >= maxFeePerGasCapWei) {
        throw new Error(`Dual insert fees reached the cap of ${formatUnits(maxFeePerGasCapWei, "gwei")} gwei`);
      }
      maxFeePerGas = maxFeePerGasCapWei;
      if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;
    }
    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  /**
   * Poll until one of the transactions sent for `nonce` is mined. Returns undefined on timeout and throws
   * InsertSupersededError when the nonce was consumed by a transaction that is not ours.
   */
  private async waitForPendingInsert(nonce: number, from: string): Promise<TransactionReceipt | undefined> {
    const provider = this.signer.provider!;
    const deadline = Date.now() + this.sendOptions.waitTimeoutMs;
    for (;;) {
      for (const hash of this.pendingHashes) {
        const receipt = await provider.getTransactionReceipt(hash);
        if (receipt) return receipt;
      }
      if (await provider.getTransactionCount(from, "latest") > nonce) {
        // The nonce moved but our receipts were not visible yet: look once more before giving up on them.
        for (const hash of this.pendingHashes) {
          const receipt = await provider.getTransactionReceipt(hash);
          if (receipt) return receipt;
        }
        this.pendingNonce = -1;
        this.pendingFees = undefined;
        this.pendingHashes = [];
        throw new InsertSupersededError(nonce);
      }
      if (Date.now() >= deadline) return undefined;
      await new Promise(resolve => setTimeout(resolve, this.sendOptions.pollIntervalMs));
    }
  }

  async getLastInsertEvent(): Promise<{
    leafIndex: bigint;
    timestamp: bigint;
    blockHash: string;
    newValueRoot: string;
    newDualRoot: string;
    newMerkleRoot: string;
  }> {
    const filter = this.contract.filters.TreeUpdate();
    const latestBlock = await this.signer.provider?.getBlockNumber();
    if (!latestBlock) throw new Error("Unable to get latest block number");
    const chunkSize = 2048;
    let currentTo = latestBlock;
    let lastEvent = null;

    while (currentTo >= 0 && !lastEvent) {
      const currentFrom = Math.max(0, currentTo - chunkSize + 1);
      const events = await this.contract.queryFilter(filter, currentFrom, currentTo);
      if (events.length > 0) {
        lastEvent = events[events.length - 1];
      }
      currentTo = currentFrom - 1;
    }

    if (!lastEvent) throw new Error("No TreeUpdate events found");

    return {
      leafIndex: lastEvent.args.leafIndex,
      timestamp: lastEvent.args.timestamp,
      blockHash: lastEvent.args.blockHash,
      newValueRoot: lastEvent.args.leafValue,   // leafValue = the insertValue (subtree root)
      newDualRoot: lastEvent.args.newDualRoot,
      newMerkleRoot: lastEvent.args.newValueRoot,
    };
  }

  async getTreeUpdateEvents(): Promise<{
    leafIndex: number;
    timestamp: number;
    blockHash: bigint;
    newValueRoot: bigint;
    newDualRoot: bigint;
    newMerkleRoot: bigint;
    value: bigint;
  }[]> {
    const chunkSize = 2048;
    const allEvents: any[] = [];

    try {
      const latestBlock = await this.signer.provider?.getBlockNumber();
      let fromBlock = await this.findDeploymentBlock();

      while (fromBlock <= (latestBlock ?? 0)) {
        const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock ?? 0);
        console.log(`Querying dual events from block ${fromBlock} to ${toBlock}`);
        const filter = this.contract.filters.TreeUpdate();
        const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
        allEvents.push(...events);
        fromBlock = toBlock + 1;
        if (fromBlock <= (latestBlock ?? 0)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return allEvents.map(event => {
        const parsedLog = this.contract.interface.parseLog(event);
        return {
          value: parsedLog?.args.leafValue,
          leafIndex: parsedLog?.args.leafIndex,
          timestamp: parsedLog?.args.timestamp,
          blockHash: parsedLog?.args.blockHash,
          newValueRoot: parsedLog?.args.newValueRoot,
          newDualRoot: parsedLog?.args.newDualRoot,
          newMerkleRoot: parsedLog?.args.newValueRoot,
        };
      });
    } catch (error: any) {
      console.error("Error querying dual events:", error);
      throw new Error(`Failed to query TreeUpdate events: ${error.message}`);
    }
  }

  async findDeploymentBlock(): Promise<number> {
    try {
      const latestBlock = await this.signer.provider?.getBlockNumber();
      if (!latestBlock) throw new Error("Unable to get latest block number");
      let low = 0;
      let high = latestBlock;
      let deploymentBlock = 0;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        try {
          const codeAtBlock = await this.signer.provider?.getCode(this.address, mid);
          if (codeAtBlock && codeAtBlock !== "0x") {
            deploymentBlock = mid;
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        } catch {
          low = mid + 1;
        }
      }
      return deploymentBlock;
    } catch {
      return 0;
    }
  }
}
