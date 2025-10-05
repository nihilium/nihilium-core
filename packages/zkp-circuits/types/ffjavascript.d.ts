declare module 'ffjavascript' {
  export const utils: {
    stringifyBigInts: (obj: any) => any;
    unstringifyBigInts: (obj: any) => any;
    leBuff2int: (buff: Buffer) => bigint;
  };
  
  export const Scalar: {
    fromRprLE: (buff: Buffer, offset: number, length: number) => any;
    shr: (n: any, shift: number) => any;
  };
} 