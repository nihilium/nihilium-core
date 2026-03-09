// Type stubs for dependencies that ship without TypeScript declarations.

declare module "circomlibjs" {
  interface BabyJub {
    Base8: [Uint8Array, Uint8Array];
    subOrder: bigint;
    F: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e(n: bigint | number): any;
      toObject(v: unknown): bigint;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mulPointEscalar(base: [any, any], scalar: bigint): [any, any];
  }
  export function buildBabyjub(): Promise<BabyJub>;
}

declare module "argon2-browser" {
  export const ArgonType: { Argon2d: 0; Argon2i: 1; Argon2id: 2 };
  export interface HashOptions {
    pass: Uint8Array | string;
    salt: Uint8Array | string;
    type: number;
    mem: number;
    time: number;
    parallelism: number;
    hashLen: number;
  }
  export interface HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }
  export function hash(opts: HashOptions): Promise<HashResult>;
  export function verify(opts: unknown): Promise<boolean>;
  const argon2: { ArgonType: typeof ArgonType; hash: typeof hash; verify: typeof verify };
  export default argon2;
}
