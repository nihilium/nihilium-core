import { PubKey, PrivKey } from "./types";
export declare function FDTEncrypt(message: bigint, pubKeys: PubKey[], threshold: number): {
    cipherTexts: {};
    empheralKey: {
        x: string;
        y: string;
    };
};
export declare function FDTDecrypt(privateKeys: PrivKey[], ciphertextMap: {
    [key: string]: string;
}, empheralKey: {
    x: string;
    y: string;
}): string;
