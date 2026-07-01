import { Contract, Signer, ethers } from "ethers";
import { EmpheralDualMerkleTreeKeccak } from "../../typechain-types";
import { EmpheralDualMerkleTreeKeccak__factory } from "../../typechain-types";

export class EmpheralDualMerkleTreeWrapper {
  private contract!: EmpheralDualMerkleTreeKeccak;
  private signer: Signer;
  private address: string;

  constructor(signer: Signer) {
    this.signer = signer;
    this.address = "";
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
    const tx = await this.contract.insert(previousLeaf, insertValue, valuePath, previousDualLeaf, previousDualLeafPath);
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction failed");
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
