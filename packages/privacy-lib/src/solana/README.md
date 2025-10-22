# Solana Integration

This directory contains the Solana implementation of the Nihilium privacy contracts.

## Files

- `ChainedProofSolana.ts` - TypeScript client for Solana ChainedProof contract
- `index.ts` - Exports for Solana functionality

## Usage

```typescript
import { ChainedProofSolana, solanaContracts } from '@nihilium/privacy-lib';

// Use the Solana ChainedProof client
const chainedProof = new ChainedProofSolana(program, provider, pda, verifier1, verifier2);
```

## Testing

The Solana implementation includes comprehensive tests in `test/base_actions_solana.test.ts` that ensure compatibility with the Ethereum implementation.

## Dependencies

The Solana integration requires:
- `@coral-xyz/anchor` - Anchor framework
- `@solana/web3.js` - Solana JavaScript SDK
- `ethers` - For keccak256 hashing compatibility
