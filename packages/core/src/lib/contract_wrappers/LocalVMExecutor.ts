import { ethers, Signer } from "ethers";
import { createEVM } from '@ethereumjs/evm';
import { SimpleStateManager } from '@ethereumjs/statemanager';
import { Common, Mainnet, Hardfork } from '@ethereumjs/common';
import { Address } from '@ethereumjs/util';
import { Interface } from 'ethers';

export interface FunctionSignature {
  name: string;
  inputs: any[];
  outputs: any[];
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
  type: "function" | "constructor" | "fallback" | "receive";
}

export interface CacheEntry {
  result: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface ContractInfo {
  address: string;
  bytecode: string;
  abi: any[];
  interface: Interface;
}

export class LocalVMExecutor {
  private evm!: any;
  private state!: SimpleStateManager;
  private common!: Common;
  private caller!: Address; // fixed caller
  private contracts: Map<string, ContractInfo>;
  private cache: Map<string, CacheEntry>;
  private pureFunctions: Map<string, Set<string>>; // contractAddress -> Set<functionSignatures>
  private viewFunctions: Map<string, Set<string>>; // contractAddress -> Set<functionSignatures>
  private provider: ethers.Provider;
  private signer?: Signer;
  private fallbackToNetwork: boolean;

  constructor(
    provider: ethers.Provider,
    signer?: Signer,
    fallbackToNetwork: boolean = true
  ) {
    this.provider = provider;
    this.signer = signer;
    this.fallbackToNetwork = fallbackToNetwork;
    this.contracts = new Map();
    this.cache = new Map();
    this.pureFunctions = new Map();
    this.viewFunctions = new Map();
  }

  /**
   * Initialize the VM - must be called before using the executor
   */
  async initialize(): Promise<void> {
    this.common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
    this.state = new SimpleStateManager();
    this.evm = await createEVM({ common: this.common, stateManager: this.state });
    this.caller = new Address(Buffer.from('0000000000000000000000000000000000000001', 'hex'));
    // Caller default account; no funding needed for value=0 calls
  }

  /**
   * Load a contract into the VM (expects runtime bytecode)
   */
  async loadContract(address: string, runtimeBytecodeHex: string, abi: any[]): Promise<void> {
    const addr = new Address(Buffer.from(address.startsWith('0x') ? address.slice(2) : address, 'hex'));
    // No explicit account funding required for code storage
    const code = Buffer.from(runtimeBytecodeHex.startsWith('0x') ? runtimeBytecodeHex.slice(2) : runtimeBytecodeHex, 'hex');
    await this.state.putCode(addr, code);

    const iface = new Interface(abi);
    this.contracts.set(address, {
      address,
      bytecode: runtimeBytecodeHex,
      abi,
      interface: iface,
    });
    this.analyzeAbi(address, abi, iface);
  }

  /**
   * Load a contract by fetching its bytecode from the network
   */
  async loadContractFromNetwork(address: string, abi: any[]): Promise<void> {
    try {
      const bytecode = await this.provider.getCode(address);
      if (bytecode === '0x') {
        throw new Error(`No bytecode found for contract ${address}`);
      }
      await this.loadContract(address, bytecode, abi);
    } catch (error) {
      console.error(`Failed to load contract ${address} from network:`, error);
      throw error;
    }
  }

  private analyzeAbi(contractAddress: string, abi: any[], interface_: Interface): void {
    const pureFuncs = new Set<string>();
    const viewFuncs = new Set<string>();

    for (const item of abi) {
      if (item.type === "function") {
        const functionFragment = interface_.getFunction(item.name);
        if (functionFragment) {
          const signature = functionFragment.format();
          
          if (item.stateMutability === "pure") {
            pureFuncs.add(signature);
          } else if (item.stateMutability === "view") {
            viewFuncs.add(signature);
          }
        }
      }
    }

    this.pureFunctions.set(contractAddress, pureFuncs);
    this.viewFunctions.set(contractAddress, viewFuncs);
  }

  private generateCacheKey(contractAddress: string, functionName: string, args: any[]): string {
    // Convert BigInt values to strings for JSON serialization
    const serializableArgs = args.map(arg => {
      if (typeof arg === 'bigint') {
        return arg.toString();
      } else if (Array.isArray(arg)) {
        return arg.map(item => typeof item === 'bigint' ? item.toString() : item);
      } else if (arg && typeof arg === 'object') {
        return JSON.parse(JSON.stringify(arg, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        ));
      }
      return arg;
    });
    const argsString = JSON.stringify(serializableArgs);
    return `${contractAddress}:${functionName}:${argsString}`;
  }

  private isCacheable(contractAddress: string, functionName: string): boolean {
    const pureFuncs = this.pureFunctions.get(contractAddress);
    return pureFuncs ? pureFuncs.has(functionName) : false;
  }

  private getCachedResult(cacheKey: string): any | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.result;
  }

  private setCachedResult(cacheKey: string, result: any, ttl: number = 300000): void {
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl,
    });
  }

  private async executeInVM(contractAddress: string, functionName: string, args: any[]): Promise<any> {
    const contractInfo = this.contracts.get(contractAddress)!;
    const fn = contractInfo.interface.getFunction(functionName)!;
    const calldata = contractInfo.interface.encodeFunctionData(fn, args);
    
    // console.log(`Executing ${functionName} on ${contractAddress}`);
    // console.log(`Calldata: ${calldata}`);
    
    const result = await this.evm.runCall({
      to: new Address(Buffer.from(contractAddress.startsWith('0x') ? contractAddress.slice(2) : contractAddress, 'hex')) as any,
      caller: this.caller as any,
      gasLimit: 10_000_000n,
      data: Buffer.from(calldata.slice(2), 'hex'),
      value: 0n,
    } as any);
    
   // console.log(`EVM execution result:`, result);
    
    if (result.execResult.exceptionError) {
      throw new Error(`EVM execution failed: ${result.execResult.exceptionError.error}`);
    }
    
    const returnData = '0x' + Buffer.from(result.execResult.returnValue).toString('hex');
    //console.log(`Return data: ${returnData}`);
    
    const decodedResult = contractInfo.interface.decodeFunctionResult(fn, returnData);
    
    // Check if this is a single struct return (common pattern in ethers)
    if (decodedResult.length === 1 && fn.outputs && fn.outputs.length === 1 && fn.outputs[0].type.includes('tuple')) {
      // Flatten single struct returns to match ethers behavior
      const structValue = decodedResult[0];
      const flatResult: any = {};
      const structOutputDef = fn.outputs[0];
      
      // Use the components array from the function output to get proper field names
      if (structOutputDef.components) {
        structOutputDef.components.forEach((component: any, index: number) => {
          if (component.name) {
            flatResult[component.name] = structValue[index];
          }
          // Also add by index for compatibility
          flatResult[index] = structValue[index];
        });
      }
      
      // Add length property
      flatResult.length = structValue.length;
      
      return flatResult;
    }
    
    // For non-struct or multi-return functions, use the original approach
    const namedResult: any = {};
    
    // Add array indices
    for (let i = 0; i < decodedResult.length; i++) {
      namedResult[i] = decodedResult[i];
    }
    
    // Add named properties from function outputs
    if (fn.outputs) {
      fn.outputs.forEach((output, index) => {
        if (output.name) {
          namedResult[output.name] = decodedResult[index];
        }
      });
    }
    
    // Add length property
    namedResult.length = decodedResult.length;
    
    return namedResult;
  }

  private async executeOnNetwork(contractAddress: string, functionName: string, args: any[]): Promise<any> {
    if (!this.fallbackToNetwork) {
      throw new Error(`Network fallback disabled and VM execution failed for ${contractAddress}.${functionName}`);
    }

    const contractInfo = this.contracts.get(contractAddress);
    if (!contractInfo) {
      throw new Error(`Contract ${contractAddress} not loaded`);
    }

    const contract = new ethers.Contract(
      contractAddress,
      contractInfo.abi,
      this.signer || this.provider
    );

    return await contract[functionName](...args);
  }

  async executeStaticCall(contractAddress: string, functionName: string, args: any[]): Promise<any> {
    const cacheKey = this.generateCacheKey(contractAddress, functionName, args);
    
    if (this.isCacheable(contractAddress, functionName)) {
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    try {
      const result = await this.executeInVM(contractAddress, functionName, args);
      
      if (this.isCacheable(contractAddress, functionName)) {
        this.setCachedResult(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      console.warn(`VM execution failed, falling back to network for ${contractAddress}.${functionName}:`, error);
      
      const networkResult = await this.executeOnNetwork(contractAddress, functionName, args);
      
      if (this.isCacheable(contractAddress, functionName)) {
        this.setCachedResult(cacheKey, networkResult);
      }
      
      return networkResult;
    }
  }

  isContractLoaded(address: string): boolean {
    return this.contracts.has(address);
  }

  getLoadedContracts(): string[] {
    return Array.from(this.contracts.keys());
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; contracts: string[]; pureFunctions: Map<string, string[]>; viewFunctions: Map<string, string[]> } {
    const pureFuncs = new Map<string, string[]>();
    const viewFuncs = new Map<string, string[]>();
    
    for (const [address, funcs] of this.pureFunctions) {
      pureFuncs.set(address, Array.from(funcs));
    }
    
    for (const [address, funcs] of this.viewFunctions) {
      viewFuncs.set(address, Array.from(funcs));
    }

    return {
      size: this.cache.size,
      contracts: this.getLoadedContracts(),
      pureFunctions: pureFuncs,
      viewFunctions: viewFuncs,
    };
  }

  isPureFunction(contractAddress: string, functionName: string): boolean {
    const pureFuncs = this.pureFunctions.get(contractAddress);
    return pureFuncs ? pureFuncs.has(functionName) : false;
  }

  isViewFunction(contractAddress: string, functionName: string): boolean {
    const viewFuncs = this.viewFunctions.get(contractAddress);
    return viewFuncs ? viewFuncs.has(functionName) : false;
  }
} 