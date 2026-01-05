# Dlog Solver (Rust)

A high-performance discrete logarithm solver for Baby Jubjub elliptic curve using lookup tables, implemented in Rust and exposed to Node.js via NAPI-RS.

## Overview

This package implements the `optimizedDecode` function from the TypeScript codebase in Rust for better performance. It solves the discrete logarithm problem on the Baby Jubjub curve by using precomputed lookup tables.

## Installation

```bash
npm install
npm run build
```

## Usage

```typescript
import { DlogSolver } from '@nihilium/dlog-solver-rs';

// Create a solver instance with precompute size 19
// The lookup table will be loaded from ./lookupTables/x19xlookupTable.json
const solver = new DlogSolver(19);

// Or specify a custom path
const solver = new DlogSolver(19, './path/to/lookupTable.json');

// Solve the discrete logarithm
// Points are passed as (x, y) coordinate strings
const result = solver.solve(
  baseX,      // Base point x-coordinate as string
  baseY,      // Base point y-coordinate as string
  encodedX,   // Encoded point x-coordinate as string
  encodedY    // Encoded point y-coordinate as string
);

console.log(result.toString()); // BigInt result
```

## API

### `DlogSolver`

#### Constructor

```typescript
new DlogSolver(precomputeSize: number, lookupTablePath?: string)
```

- `precomputeSize`: The precompute size (typically 19)
- `lookupTablePath`: Optional path to the lookup table JSON file. Defaults to `./lookupTables/x{precomputeSize}xlookupTable.json`

#### Methods

##### `solve(baseX: string, baseY: string, encodedX: string, encodedY: string): BigInt`

Solves the discrete logarithm problem.

- `baseX`, `baseY`: Base point coordinates as decimal strings
- `encodedX`, `encodedY`: Encoded point coordinates as decimal strings
- Returns: `BigInt` - The solution

Throws an error if no solution is found.

## Building

```bash
# Build release version
npm run build

# Build debug version
npm run build:debug
```

## Requirements

- Rust (latest stable)
- Node.js >= 10
- The lookup table JSON file must be available at the specified path

## Implementation Details

- Uses Baby Jubjub curve parameters: a=168700, d=168696
- Base field: BN254 base field (Fq)
- Implements twisted Edwards curve arithmetic
- Caches base point multiplications for performance
- Loads lookup table once per instance


