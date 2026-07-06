import { Contract, Signer, ethers } from "ethers";
import { ChainedProofV2 } from "../../typechain-types"; // auto-generated
import { ChainedProofV2__factory } from "../../typechain-types";
import { ProvingStateV2 } from "../unseal_conditions/ChainedProofV2";
import { toPaddedHex } from "../utils";
import { LocalVMExecutor } from "./LocalVMExecutor";


function createMutableState(state: ProvingStateV2): ProvingStateV2 {
    return {
        ...state,
        outputs: [...state.outputs],
        prepared_public_inputs: [...state.prepared_public_inputs],
        prepared_proof: (state.prepared_proof && state.prepared_proof !== "") ? state.prepared_proof : "0x",
    };
}

/**
 * Normalize a state's prepared_proof so ethers can ABI-encode it as `bytes`.
 * An empty string "" is not valid BytesLike; replace with "0x".
 */
function sanitizeStateForABI(state: any): any {
    if (state && (state.prepared_proof === "" || state.prepared_proof === undefined || state.prepared_proof === null)) {
        return { ...state, prepared_proof: "0x" };
    }
    return state;
}

export class ChainedProofWrapperV2 {
  private contract!: ChainedProofV2;
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
    const factory = new ethers.ContractFactory(ChainedProofV2__factory.abi, ChainedProofV2__factory.bytecode, this.provider);
    this.contract = (await factory.attach(address) as unknown) as ChainedProofV2;
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
          ChainedProofV2__factory.abi as unknown as any[]
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

  getContract(): ChainedProofV2 {
    return this.contract;
  }

  private getStateFromResult(result: any): ProvingStateV2 {
    
    return createMutableState({
      current_hash: result.current_hash,
      verifier_must_be_true: result.verifier_must_be_true,
      // expected_hash: result.expected_hash,
      current_index: Number(result.current_index), // Convert bigint to number
      outputs: result.outputs,
      prepared_public_inputs: result.prepared_public_inputs,
      prepared_proof: result.prepared_proof,
      proof_verifier: result.proof_verifier,
      // commited_processor_public_key: result.commited_processor_public_key,
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

  async dryrunPrepareNextProof(state: any, verifier: string, verifierMustBeTrue: boolean, publicInputs: string[], proof: string): Promise<string> {
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

    const result = await this.executeStaticCall("dryrun_prepare_next_proof", [sanitizeStateForABI(state), verifier, verifierMustBeTrue, publicInputs, proof]);
    return result as string;
  }

  async dryrunValidateDataRoot(
    state: any,
    datastream: string,
    outputSignalIndex: number,
  ): Promise<string> {
    const result = await this.executeStaticCall("dryrun_validate_data_root", [
      sanitizeStateForABI(state),
      datastream,
      outputSignalIndex, 
    ], true); //Force remote call as the data streams is filled by another service
    return result as string;
  }

 
  async dryrunChainStaticInput(
    state: any,
    value: bigint,
    public_input_index: number
  ): Promise<string> {
    const result = await this.executeStaticCall("dryrun_chain_static_input", [sanitizeStateForABI(state), toPaddedHex(value, 32), public_input_index]);
    return result as string;
  }

 

  async dryrunChainPassSignal(
    state: any,
    public_input_indexes: number[],
    output_signal_indexes: number[],
    dryrunMode: boolean = false
  ): Promise<string> {
    const result = await this.executeStaticCall("dryrun_chain_pass_signal", [
      sanitizeStateForABI(state),
      public_input_indexes,
      output_signal_indexes
    ]);
    return result as string;
  }

  async dryrunChainProofVerify(
    state: any,
    mask: string,
    ignoreProof: boolean
  ): Promise<string> {
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

    const result = await this.executeStaticCall("dryrun_chain_proof_verify", [sanitizeStateForABI(state), mask, ignoreProof]);
    return result as string;
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
