# Local VM Executor for ChainedProof

This directory contains a local VM-based execution system for running smart contract static calls without network interaction, with intelligent caching for pure functions.

## Overview

The `LocalVMExecutor` class provides a way to execute smart contract calls locally using `@ethereumjs/vm`, which can significantly improve performance for repeated calls and reduce network dependency.

## Components

### LocalVMExecutor

The main class that handles:
- Local VM initialization and contract deployment
- Static call execution
- Intelligent caching of pure function results
- Fallback to network calls when VM execution fails

### ChainedProofWrapper Integration

The `ChainedProofWrapper` has been modified to optionally use the `LocalVMExecutor` for all static calls, providing:
- Seamless integration with existing code
- Automatic fallback to network calls
- Cache management capabilities
- Performance monitoring

## Features

### 1. ABI Analysis
- Automatically identifies pure and view functions from the contract ABI
- Pure functions are cached for optimal performance
- View functions are executed locally but not cached

### 2. Intelligent Caching
- Pure function results are cached with configurable TTL
- Cache keys are generated based on function name and arguments
- Automatic cache expiration and cleanup

### 3. Fallback Mechanism
- VM execution failures automatically fall back to network calls
- Configurable fallback behavior
- Graceful error handling

### 4. Performance Benefits
- Eliminates network latency for cached pure functions
- Reduces RPC calls and associated costs
- Improves development and testing experience

## Usage

### Basic Usage with ChainedProofWrapper

```typescript
import { ChainedProofWrapper } from "./ChainedProofWrapper";
import { ethers } from "ethers";

// Create wrapper with local VM enabled
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const wrapper = new ChainedProofWrapper(provider, undefined, true);

// Attach to deployed contract
await wrapper.attach("0x...");

// Execute static calls (will use local VM when possible)
const result = await wrapper.dryrunPrepareNextProof(state, verifier, inputs, proof);
```

### Direct LocalVMExecutor Usage

```typescript
import { LocalVMExecutor } from "./LocalVMExecutor";

const executor = new LocalVMExecutor(
  provider,
  contractAddress,
  contractBytecode,
  contractAbi,
  signer,
  true // fallback to network
);

const result = await executor.executeStaticCall("functionName", args);
```

### Cache Management

```typescript
// Clear cache
wrapper.clearCache();

// Get cache statistics
const stats = wrapper.getCacheStats();
console.log("Cache size:", stats.size);
console.log("Pure functions:", stats.pureFunctions);
```

## Configuration

### Constructor Options

```typescript
new ChainedProofWrapper(
  provider: ethers.Provider,
  signer?: Signer,
  useLocalVM: boolean = true  // Enable/disable local VM
)
```

### LocalVMExecutor Options

```typescript
new LocalVMExecutor(
  provider: ethers.Provider,
  contractAddress: string,
  contractBytecode: string,
  contractAbi: any[],
  signer?: Signer,
  fallbackToNetwork: boolean = true  // Enable/disable network fallback
)
```

## Performance Considerations

### When to Use Local VM

- **Development and Testing**: Eliminates network dependency
- **Repeated Calls**: Pure functions are cached for subsequent calls
- **Offline Scenarios**: Works without network connectivity
- **Performance Critical Applications**: Reduces latency for cached functions

### When to Use Network Only

- **Production with Fresh Data**: When you need the latest state
- **Complex State Dependencies**: When contract state changes frequently
- **Debugging Network Issues**: When you need to test network connectivity

## Dependencies

The following modern @ethereumjs packages are required:

```json
{
  "@ethereumjs/vm": "^7.0.0",
  "@ethereumjs/common": "^4.0.0",
  "@ethereumjs/block": "^5.0.0",
  "@ethereumjs/tx": "^5.0.0",
  "@ethereumjs/util": "^8.0.0"
}
```

### Type Declarations

The @ethereumjs packages include their own TypeScript declarations, so no additional @types packages are needed.

## Limitations

1. **VM Compatibility**: Some complex contract interactions may not work in the local VM
2. **State Synchronization**: Local VM doesn't maintain network state
3. **Gas Estimation**: Local execution may not accurately reflect network gas costs
4. **External Dependencies**: Contracts that depend on other contracts may fail locally

## Error Handling

The system provides graceful error handling:

1. **VM Execution Failures**: Automatically fall back to network calls
2. **Cache Misses**: Execute fresh calls and cache results
3. **Network Failures**: Throw descriptive errors
4. **ABI Errors**: Validate function existence before execution

## Examples

See `LocalVMExecutorExample.ts` for comprehensive usage examples including:
- Basic integration with ChainedProofWrapper
- Direct LocalVMExecutor usage
- Cache performance demonstrations
- Error handling scenarios

## Migration from Legacy ethereumjs

If you were using the legacy ethereumjs packages, the main changes are:

1. **Package Names**: All packages now use the `@ethereumjs/` prefix
2. **API Changes**: 
   - `VM.create()` instead of `new VM()`
   - `Common.custom()` instead of `Common.forCustomChain()`
   - `bytesToHex()` and `hexToBytes()` instead of `bufferToHex()` and `toBuffer()`
   - BigInt values for gas limits, prices, and nonces
3. **Type Safety**: Better TypeScript support with built-in type declarations 