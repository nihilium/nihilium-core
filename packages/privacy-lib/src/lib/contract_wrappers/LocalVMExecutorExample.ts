import { ethers } from "ethers";
import { ChainedProofWrapper } from "./ChainedProofWrapper";
import { LocalVMExecutor } from "./LocalVMExecutor";

/**
 * Example demonstrating how to use LocalVMExecutor with ChainedProofWrapper
 */
export class LocalVMExecutorExample {
  
  /**
   * Example of using ChainedProofWrapper with local VM execution and verifier loading
   */
  static async exampleUsage() {
    // Create a provider (could be any provider)
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    
    // Create ChainedProofWrapper with local VM enabled
    const wrapper = new ChainedProofWrapper(provider, undefined, true);
    
    // Attach to a deployed contract
    const contractAddress = "0x..."; // Replace with actual contract address
    await wrapper.attach(contractAddress);
    
    // Check if local VM is being used
    console.log("Using local VM:", wrapper.isUsingLocalVM());
    
    // Preload common verifier contracts
    const commonVerifiers = [
      "0x1234567890123456789012345678901234567890", // Replace with actual verifier addresses
      "0x0987654321098765432109876543210987654321"
    ];
    
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
    
    await wrapper.preloadCommonVerifiers(commonVerifiers, genericVerifierAbi);
    
    // Get cache statistics
    const cacheStats = wrapper.getCacheStats();
    if (cacheStats) {
      console.log("Cache stats:", cacheStats);
      console.log("Loaded contracts:", cacheStats.contracts);
      console.log("Loaded verifiers:", wrapper.getLoadedVerifiers());
    }
    
    // Example: Execute a dryrun function
    const state = {
      current_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expected_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      current_index: 0,
      outputs: [],
      prepared_public_inputs: [],
      prepared_proof: "0x",
      proof_verifier: "0x1234567890123456789012345678901234567890",
      commited_processor_public_key: [],
      initiator: "0x0000000000000000000000000000000000000000"
    };
    
    try {
      const result = await wrapper.dryrunPrepareNextProof(
        state,
        "0x1234567890123456789012345678901234567890",
        ["0x0000000000000000000000000000000000000000000000000000000000000000"],
        "0x"
      );
      console.log("Dryrun result:", result);
    } catch (error) {
      console.error("Error executing dryrun:", error);
    }
  }
  
  /**
   * Example of using LocalVMExecutor directly with multiple contracts
   */
  static async directExecutorExample() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    
    // Create executor
    const executor = new LocalVMExecutor(provider, undefined, true);
    
    // Example contract details (replace with actual values)
    const mainContractAddress = "0x...";
    const mainContractBytecode = "0x...";
    const mainContractAbi = [
      {
        "inputs": [],
        "name": "getValue",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "pure",
        "type": "function"
      }
    ];
    
    const verifierAddress = "0x...";
    const verifierAbi = [
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
    
    try {
      // Load main contract
      await executor.loadContract(mainContractAddress, mainContractBytecode, mainContractAbi);
      
      // Load verifier from network
      await executor.loadContractFromNetwork(verifierAddress, verifierAbi);
      
      // Execute static calls on different contracts
      const mainResult = await executor.executeStaticCall(mainContractAddress, "getValue", []);
      console.log("Main contract result:", mainResult);
      
      const verifierResult = await executor.executeStaticCall(verifierAddress, "verify", ["0x", []]);
      console.log("Verifier result:", verifierResult);
      
      // Get cache statistics
      const stats = executor.getCacheStats();
      console.log("Cache stats:", stats);
      console.log("Loaded contracts:", executor.getLoadedContracts());
      
    } catch (error) {
      console.error("Error with direct executor:", error);
    }
  }
  
  /**
   * Example showing cache benefits with multiple contracts
   */
  static async cachePerformanceExample() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wrapper = new ChainedProofWrapper(provider, undefined, true);
    
    // Attach to contract
    await wrapper.attach("0x..."); // Replace with actual address
    
    // Preload verifiers
    const verifierAbi = [
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
    
    await wrapper.preloadCommonVerifiers([
      "0x1234567890123456789012345678901234567890"
    ], verifierAbi);
    
    // Execute the same function multiple times
    const state = {
      current_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expected_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      current_index: 0,
      outputs: [],
      prepared_public_inputs: [],
      prepared_proof: "0x",
      proof_verifier: "0x1234567890123456789012345678901234567890",
      commited_processor_public_key: [],
      initiator: "0x0000000000000000000000000000000000000000"
    };
    
    const startTime = Date.now();
    
    // First call (will be slower, no cache)
    await wrapper.dryrunPrepareNextProof(
      state,
      "0x1234567890123456789012345678901234567890",
      ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      "0x"
    );
    
    const firstCallTime = Date.now() - startTime;
    console.log("First call time:", firstCallTime, "ms");
    
    // Second call (should be faster due to cache)
    const secondStartTime = Date.now();
    await wrapper.dryrunPrepareNextProof(
      state,
      "0x1234567890123456789012345678901234567890",
      ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      "0x"
    );
    
    const secondCallTime = Date.now() - secondStartTime;
    console.log("Second call time:", secondCallTime, "ms");
    console.log("Performance improvement:", ((firstCallTime - secondCallTime) / firstCallTime * 100).toFixed(2), "%");
    
    // Show loaded contracts and verifiers
    console.log("Loaded verifiers:", wrapper.getLoadedVerifiers());
    const stats = wrapper.getCacheStats();
    if (stats) {
      console.log("Total loaded contracts:", stats.contracts.length);
    }
  }
  
  /**
   * Example showing dynamic contract loading during execution
   */
  static async dynamicLoadingExample() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wrapper = new ChainedProofWrapper(provider, undefined, true);
    
    await wrapper.attach("0x..."); // Replace with actual address
    
    // Start with a state that references a verifier
    const state = {
      current_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      expected_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      current_index: 0,
      outputs: [],
      prepared_public_inputs: [],
      prepared_proof: "0x",
      proof_verifier: "0x1234567890123456789012345678901234567890",
      commited_processor_public_key: [],
      initiator: "0x0000000000000000000000000000000000000000"
    };
    
    console.log("Before dryrunChainProofVerify - loaded verifiers:", wrapper.getLoadedVerifiers());
    
    // This will automatically load the verifier contract when needed
    try {
      const result = await wrapper.dryrunChainProofVerify(state, false);
      console.log("After dryrunChainProofVerify - loaded verifiers:", wrapper.getLoadedVerifiers());
      console.log("Result:", result);
    } catch (error) {
      console.error("Error in dynamic loading example:", error);
    }
  }
} 