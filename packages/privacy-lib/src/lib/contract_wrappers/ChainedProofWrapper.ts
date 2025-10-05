import { Contract, Signer, ethers } from "ethers";
import { ChainedProof } from "../../typechain-types"; // auto-generated
import { ChainedProof__factory } from "../../typechain-types";
import { ProvingState } from "../reveal_methods/base_functions/ChainedProof";
import { toPaddedHex } from "../utils";
import { LocalVMExecutor } from "./LocalVMExecutor";


function createMutableState(state: ProvingState): ProvingState {
    return {
        ...state,
        outputs: state.outputs.map(arr => [...arr]),
        prepared_public_inputs: [...state.prepared_public_inputs],
        commited_processor_public_key: [...state.commited_processor_public_key]
    };
}

export class ChainedProofWrapper {
  private contract!: ChainedProof;
  private signer?: Signer;
  private provider: ethers.Provider;
  private address: string;
  private localExecutor?: LocalVMExecutor;
  private useLocalVM: boolean;
  private loadedVerifiers: Set<string>;

  constructor(
    provider: ethers.Provider, 
    signer: Signer | undefined = undefined,
    useLocalVM: boolean = true
  ) {
    this.signer = signer;
    this.address = "";
    this.provider = signer ? signer.provider! : provider;
    this.useLocalVM = useLocalVM;
    this.loadedVerifiers = new Set();
  }

  // async deploy(publicProofVerifier: string, forcedOpeningVerifier: string): Promise<void> {
  //   const factory = new ethers.ContractFactory(ChainedProof__factory.abi, ChainedProof__factory.bytecode, this.signer);
  //   this.contract = (await factory.deploy(
  //     publicProofVerifier,
  //     forcedOpeningVerifier
  //   ) as unknown) as ChainedProof;

  //   await this.contract.waitForDeployment();
  //   this.address = await this.contract.getAddress();
  //   console.log("ChainedProof deployed at:", this.address);
  // }

  async attach(address: string): Promise<void> {
    const factory = new ethers.ContractFactory(ChainedProof__factory.abi, ChainedProof__factory.bytecode, this.provider);
    this.contract = (await factory.attach(address) as unknown) as ChainedProof;
    this.address = address;
    console.log("ChainedProof attached at:", address);

    // Initialize local VM executor if enabled
    if (this.useLocalVM) {
      try {
        this.localExecutor = new LocalVMExecutor(
          this.provider,
          this.signer,
          true // fallback to network
        );
        
        // Initialize the VM
        await this.localExecutor.initialize();
        
        // Load the main ChainedProof contract from network (to get runtime bytecode)
        await this.localExecutor.loadContractFromNetwork(
          address,
          ChainedProof__factory.abi as unknown as any[]
        );
        
        console.log("Local VM executor initialized for ChainedProof");
      } catch (error) {
        console.warn("Failed to initialize local VM executor, falling back to network calls:", error);
        this.useLocalVM = false;
      }
    }
  }

  getAddress(): string {
    return this.address;
  }

  getContract(): ChainedProof {
    return this.contract;
  }

  private getStateFromResult(result: any): ProvingState {
    
    return createMutableState({
      current_hash: result.current_hash,
      expected_hash: result.expected_hash,
      current_index: result.current_index,
      outputs: result.outputs,
      prepared_public_inputs: result.prepared_public_inputs,
      prepared_proof: result.prepared_proof,
      proof_verifier: result.proof_verifier,
      commited_processor_public_key: result.commited_processor_public_key,
      initiator: result.initiator
    });
  }

  /**
   * Load a verifier contract into the VM for external calls
   */
  async loadVerifierContract(verifierAddress: string, verifierAbi: any[]): Promise<void> {
    if (!this.localExecutor) {
      console.warn("Local VM executor not initialized, skipping verifier loading");
      return;
    }

    if (this.loadedVerifiers.has(verifierAddress)) {
      console.log(`Verifier ${verifierAddress} already loaded`);
      return;
    }

    try {
      // Try to load from network first
      await this.localExecutor.loadContractFromNetwork(verifierAddress, verifierAbi);
      this.loadedVerifiers.add(verifierAddress);
      console.log(`Verifier contract ${verifierAddress} loaded into VM`);
    } catch (error) {
      console.warn(`Failed to load verifier ${verifierAddress} from network:`, error);
      // Could add fallback logic here if needed
    }
  }

  /**
   * Preload common verifier contracts that might be called during dryrun operations
   */
  async preloadCommonVerifiers(verifierAddresses: string[], verifierAbi: any[]): Promise<void> {
    for (const address of verifierAddresses) {
      await this.loadVerifierContract(address, verifierAbi);
    }
  }

  private async executeStaticCall(functionName: string, args: any[], forceRemote: boolean = false): Promise<any> {
    if (this.useLocalVM && this.localExecutor && !forceRemote) {
      try {
        return await this.localExecutor.executeStaticCall(this.address, functionName, args);
      } catch (error) {
        console.warn(`Local VM execution failed for ${functionName}, falling back to network:`, error);
        // Fallback to network call
        return await (this.contract as any)[functionName].staticCall(...args);
      }
    } else {
      // Use network call directly
      return await (this.contract as any)[functionName].staticCall(...args);
    }
  }

  async dryrunPrepareNextProof(state: any, verifier: string, publicInputs: string[], proof: string): Promise<ProvingState> {
    // Ensure verifier is loaded if using local VM
    if (this.useLocalVM && this.localExecutor && !this.loadedVerifiers.has(verifier)) {
      // Try to load a generic verifier ABI - you might want to customize this
      const genericVerifierAbi = [
        {
          "inputs": [
            {"internalType": "bytes", "name": "proof", "type": "bytes"},
            {"internalType": "bytes32[]", "name": "publicInputs", "type": "bytes32[]"}
          ],
          "name": "verify",
          "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      await this.loadVerifierContract(verifier, genericVerifierAbi);
    }

    const result = await this.executeStaticCall("dryrun_prepare_next_proof", [state, verifier, publicInputs, proof]);
    return this.getStateFromResult(result);
  }

  async dryrunValidateDataRoot(
    state: any,
    datastream: string,
    publicInputIndex: number,
    isDelayedProof: boolean = false,
    optionalDualTreeProof: string = toPaddedHex(0n),
    optionalDualTreePublicInputs: string[] = [],
    merkleRootIndex: number = 0
  ): Promise<ProvingState> {
    const result = await this.executeStaticCall("dryrun_validate_data_root", [
      state,
      datastream,
      publicInputIndex,
      isDelayedProof,
      optionalDualTreeProof,
      optionalDualTreePublicInputs,
      toPaddedHex(BigInt(merkleRootIndex))
    ], true); //Force remote call as the data streams is filled by another service
    return this.getStateFromResult(result);
  }

  async dryrunValidateTimestamp(
    state: any,
    outputProofIndex: number,
    outputIndex: number,
    publicInputIndex: number,
    timestampWindow: number
  ): Promise<ProvingState> {
    
    const result = await this.executeStaticCall("dryrun_validate_timestamp", [
      state,
      outputProofIndex,
      outputIndex,
      publicInputIndex,
      timestampWindow
    ]);
    return this.getStateFromResult(result);
  }

  async dryrunChainStaticInput(
    state: any,
    inputs: string[],
    indexes: number[]
  ): Promise<ProvingState> {
    const result = await this.executeStaticCall("dryrun_chain_static_input", [state, inputs, indexes]);
    return this.getStateFromResult(result);
  }

 

  async dryrunChainPassSignal(
    state: any,
    publicInputIndexes: number[],
    outputProofIndexes: number[],
    outputIndexes: number[],
    dryrunMode: boolean = false
  ): Promise<ProvingState> {
    const result = await this.executeStaticCall("dryrun_chain_pass_signal", [
      state,
      publicInputIndexes,
      outputProofIndexes,
      outputIndexes
    ]);
    return this.getStateFromResult(result);
  }

  async dryrunChainProofVerify(
    state: any,
    ignoreProof: boolean
  ): Promise<ProvingState> {
    // Ensure the proof verifier is loaded if using local VM
    if (this.useLocalVM && this.localExecutor && state.proof_verifier && !this.loadedVerifiers.has(state.proof_verifier)) {
      // Try to load a generic verifier ABI
      const genericVerifierAbi = [
        {
          "inputs": [
            {"internalType": "bytes", "name": "proof", "type": "bytes"},
            {"internalType": "bytes32[]", "name": "publicInputs", "type": "bytes32[]"}
          ],
          "name": "verify",
          "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      await this.loadVerifierContract(state.proof_verifier, genericVerifierAbi);
    }

    // const gas = await this.contract.dryrun_chain_proof_verify.estimateGas(state, true);
    // const gas2 = await this.contract.dryrun_chain_proof_verify.estimateGas(state, false);
    // console.log("gas", gas)
    // console.log("gas2", gas2)
    const result = await this.executeStaticCall("dryrun_chain_proof_verify", [state, ignoreProof]);
    return this.getStateFromResult(result);
  }

  async dryrunStartProving(
    verifier: string,
    publicInputs: string[],
    proof: string,
    verifyProof: boolean
  ): Promise<ProvingState> {
    // Ensure verifier is loaded if using local VM
    if (this.useLocalVM && this.localExecutor && !this.loadedVerifiers.has(verifier)) {
      const genericVerifierAbi = [
        {
          "inputs": [
            {"internalType": "bytes", "name": "proof", "type": "bytes"},
            {"internalType": "bytes32[]", "name": "publicInputs", "type": "bytes32[]"}
          ],
          "name": "verify",
          "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      await this.loadVerifierContract(verifier, genericVerifierAbi);
    }

    // const tx = await this.contract.dryrun_start_proving(verifier, publicInputs, proof, verifyProof);
    // const receipt = await tx.wait();
    // if (!receipt) throw new Error("Transaction failed");
    
    const result = await this.executeStaticCall("dryrun_start_proving", [verifier, publicInputs, proof, verifyProof]);
    return this.getStateFromResult(result);
  }

  // Helper methods for cache management
  clearCache(): void {
    if (this.localExecutor) {
      this.localExecutor.clearCache();
    }
  }

  getCacheStats(): { size: number; contracts: string[]; pureFunctions: Map<string, string[]>; viewFunctions: Map<string, string[]> } | null {
    if (this.localExecutor) {
      return this.localExecutor.getCacheStats();
    }
    return null;
  }

  // Method to toggle local VM usage
  setUseLocalVM(useLocalVM: boolean): void {
    this.useLocalVM = useLocalVM;
  }

  // Method to check if local VM is being used
  isUsingLocalVM(): boolean {
    return this.useLocalVM && this.localExecutor !== undefined;
  }

  // Method to get loaded verifiers
  getLoadedVerifiers(): string[] {
    return Array.from(this.loadedVerifiers);
  }

  // Method to check if a verifier is loaded
  isVerifierLoaded(verifierAddress: string): boolean {
    return this.loadedVerifiers.has(verifierAddress);
  }
}
