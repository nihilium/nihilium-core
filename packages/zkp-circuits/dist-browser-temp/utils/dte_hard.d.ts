import { PubKey, PrivKey } from "./types";
export interface EccCiphertext {
    c: string;
    R: {
        x: string;
        y: string;
    };
}
export interface CombinationSeal {
    members: string[];
    lanes: EccCiphertext[][];
    pkZ: string;
    zSeal: EccCiphertext;
    payload: string;
}
export interface FDTSealedPackage {
    m: number;
    threshold: number;
    combinations: {
        [index: string]: CombinationSeal;
    };
}
export declare function FDTEncrypt(message: bigint, pubKeys: PubKey[], threshold: number, m?: number): FDTSealedPackage;
export declare function FDTDecrypt(privateKeys: PrivKey[], pkg: FDTSealedPackage): string;
