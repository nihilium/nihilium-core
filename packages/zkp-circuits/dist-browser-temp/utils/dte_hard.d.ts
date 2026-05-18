import { PubKey, PrivKey } from "./types";
export interface FDTSealedPackage {
    cipherTexts: {
        [key: string]: string;
    };
    ephemeralKeys: {
        x: string;
        y: string;
    }[];
    rounds: number;
}
export declare function FDTEncrypt(message: bigint, pubKeys: PubKey[], threshold: number): FDTSealedPackage;
export declare function FDTDecrypt(privateKeys: PrivKey[], ciphertextMap: {
    [key: string]: string;
}, ephemeralKeys: {
    x: string;
    y: string;
}[]): string;
