import { Contract, Signer, ethers } from "ethers";
import { EmpheralMerkleTreeKeccak } from "../../typechain-types"; // auto-generated
import { EmpheralMerkleTreeKeccak__factory } from "../../typechain-types";

export class EmpheralMerkleTreeWrapper {
  private contract!: EmpheralMerkleTreeKeccak;
  private signer: Signer;
  private address: string;
  private _callbacks: Array<(event: { leafIndex: number; timestamp: number; newValueRoot: bigint; leafHash: bigint; newMerkleRoot: bigint }) => void> = [];

  constructor(signer: Signer) {
    this.signer = signer;
    this._callbacks = [];
    this.address = "";
  }

  async deploy(levels: number): Promise<void> {
    const factory = new ethers.ContractFactory(EmpheralMerkleTreeKeccak__factory.abi, EmpheralMerkleTreeKeccak__factory.bytecode, this.signer);
     this.contract = (await factory.deploy(
      await this.signer.getAddress(),
      levels      
    ) as unknown) as EmpheralMerkleTreeKeccak;

    await this.contract.waitForDeployment();
    this.address = await this.contract.getAddress();
    console.log("DualMerkleTree deployed at:", this.address);
  }

  async getCurrentIndex(): Promise<bigint> {
    return await this.contract.currentIndex()
    }

  async attach(address: string): Promise<void> {
    const factory = new ethers.ContractFactory(EmpheralMerkleTreeKeccak__factory.abi, EmpheralMerkleTreeKeccak__factory.bytecode, this.signer);
    this.contract = factory.attach(address) as EmpheralMerkleTreeKeccak;
    this.address = address;
    console.log("DualMerkleTree attached at:", address);
  }

  getAddress(): string {
    return this.address;
  }

  getContract(): EmpheralMerkleTreeKeccak {
    return this.contract;
  }

  subscribeToTreeUpdate(callback: (event: { leafIndex: number; timestamp: number; newValueRoot: bigint; leafHash: bigint; newMerkleRoot: bigint }) => void): void {
    this._callbacks.push(callback);
  }

  private _emitTreeUpdate(event: { leafIndex: number; timestamp: number; newValueRoot: bigint; leafHash: bigint; newMerkleRoot: bigint }): void {
    this._callbacks.forEach(cb => cb(event));
  }

  async findDeploymentBlock(): Promise<number> {
    try {
      console.log('Finding deployment block for contract:', this.address);
      
      // Get the contract code to verify it exists
      const code = await this.signer.provider?.getCode(this.address);
      if (!code || code === '0x') {
        throw new Error('Contract not found at address');
      }

      // Binary search to find the deployment block
      const latestBlock = await this.signer.provider?.getBlockNumber();
      if (!latestBlock) {
        throw new Error('Unable to get latest block number');
      }

      let low = 0;
      let high = latestBlock;
      let deploymentBlock = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        
        try {
          const codeAtBlock = await this.signer.provider?.getCode(this.address, mid);
          
          if (codeAtBlock && codeAtBlock !== '0x') {
            // Contract exists at this block, try to find earlier deployment
            deploymentBlock = mid;
            high = mid - 1;
          } else {
            // Contract doesn't exist at this block, deployment is later
            low = mid + 1;
          }
        } catch (error) {
          // If we can't get code at this block, try later blocks
          low = mid + 1;
        }
      }

      console.log(`Found deployment block: ${deploymentBlock}`);
      return deploymentBlock;
      
    } catch (error) {
      console.warn('Could not determine deployment block, defaulting to 0:', error);
      return 0;
    }
  }

  async getTreeUpdateEvents(): Promise<{
    leafIndex: number,
    timestamp: number,
    newValueRoot: bigint,    
    newMerkleRoot: bigint,
    value: bigint
  }[]> {
    const chunkSize = 2048; // Adjust this value based on your RPC provider's limits
    const allEvents: any[] = [];
    
    try {
      // Get the latest block number
      const latestBlock = await this.signer.provider?.getBlockNumber();
      
      // Find deployment block automatically from the contract address
      let fromBlock = await this.findDeploymentBlock();
      
      // Query events in chunks
      while (fromBlock <= (latestBlock? latestBlock : 0)) {
        const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock? latestBlock : 0);
        
        console.log(`Querying events from block ${fromBlock} to ${toBlock}`);
        
        const filter = this.contract.filters.TreeUpdate();
        const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
        
        allEvents.push(...events);
        
        // Move to next chunk
        fromBlock = toBlock + 1;
        
        // Add a small delay to avoid overwhelming the RPC endpoint
        if (fromBlock <= (latestBlock? latestBlock : 0)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Total events found: ${allEvents.length}`);
      
      return allEvents.map(event => {
        const parsedLog = this.contract.interface.parseLog(event);
        return {
          value: parsedLog?.args.leafValue,        
          leafIndex: parsedLog?.args.leafIndex,
          timestamp: parsedLog?.args.timestamp,
          newValueRoot: parsedLog?.args.newValueRoot,
          newMerkleRoot: parsedLog?.args.newMerkleRoot
        };
      });
      
    } catch (error: any) {
      console.error('Error querying events:', error);
      
      // Fallback: try to get events from a smaller recent range
      try {
        console.log('Attempting fallback query for recent events only...');
        const latestBlock = await this.signer.provider?.getBlockNumber();
        const fallbackRange = 1000; // Query only last 1000 blocks
        const deploymentBlock = await this.findDeploymentBlock();
        const fromBlock = Math.max(deploymentBlock, latestBlock? - fallbackRange : 0);
        
        const filter = this.contract.filters.TreeUpdate();
        const fallbackEvents = await this.contract.queryFilter(filter, fromBlock, latestBlock);
        
        console.log(`Fallback query found ${fallbackEvents.length} events`);
        
        return fallbackEvents.map(event => {
          const parsedLog = this.contract.interface.parseLog(event);
          return {
            value: parsedLog?.args.leafValue,        
            leafIndex: parsedLog?.args.leafIndex,
            timestamp: parsedLog?.args.timestamp,
            newValueRoot: parsedLog?.args.newValueRoot,
            newMerkleRoot: parsedLog?.args.newMerkleRoot
          };
        });
        
      } catch (fallbackError: any) {
        console.error('Fallback query also failed:', fallbackError);
        throw new Error(`Failed to query TreeUpdate events: ${error.message}. Fallback also failed: ${fallbackError.message}`);
      }
    }
  }
  async getLogs(): Promise<any[]> {
    const filter = this.contract.filters.Log();
    const events = await this.contract.queryFilter(filter);
    return events.map(event => {
      const parsedLog = this.contract.interface.parseLog(event);
      return [parsedLog?.args.value1, parsedLog?.args.value2, parsedLog?.args.value3];
    });
  }

  startListeningToTreeUpdates(): void {
    const filter = this.contract.filters.TreeUpdate();
    this.contract.on(filter, (...args) => {
      const [leafIndex, timestamp, newValueRoot, leafHash] = args;
      const event = {
        leafIndex: Number(leafIndex),
        timestamp: Number(timestamp),
        newValueRoot: BigInt(newValueRoot),
        leafHash: BigInt(leafHash),
          newMerkleRoot: BigInt(newValueRoot)
        };
      this._emitTreeUpdate(event);
    });
  }

  stopListeningToTreeUpdates(): void {
    this.contract.removeAllListeners();
  }
  // async hash(left: string, right: string): Promise<string> {
  //   return await this.contract.hashLeftRightPos(left, right);
  // }

  async insert(previousLeaf: string, insertValue: string, valuePath: string[]): Promise<{
    index: number, 
    timestamp: number, 
    newValueRoot: bigint, leafValue: bigint, leafHash: bigint, gasUsed: string}> {
    const tx = await this.contract.insert(previousLeaf, insertValue, valuePath);
    
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction failed");
    const gasUsed = receipt.gasUsed?.toString();
    console.log(`Gas used for insert: ${gasUsed}`);
    const event = receipt.logs?.find((e) => {
        const parsedLog = this.contract.interface.parseLog(e);
        return parsedLog?.name === "TreeUpdate";
    });
    if (!event) throw new Error("TreeUpdate event not found");

    const parsedLog = this.contract.interface.parseLog(event);
    const index = parsedLog?.args.leafIndex;
    const timestamp = parsedLog?.args.timestamp;
    const newValueRoot = parsedLog?.args.newValueRoot;
    const leafValue = parsedLog?.args.leafValue;
    const leafHash = parsedLog?.args.leafHash;
    console.log(`Inserted at index: ${index}`);
    return {index, timestamp, newValueRoot, leafValue, leafHash, gasUsed};
  }

  

  async getLastMerkleRoot(): Promise<string> {
    return await this.contract.getLastMerkleRoot();
  }

  

  async isKnownValueRoot(root: string): Promise<boolean> {
    return await this.contract.isKnownValueRoot(root);
  }
}
