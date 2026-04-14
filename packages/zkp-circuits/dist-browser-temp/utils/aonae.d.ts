import { PubKey, PrivKey } from "./types";
export interface AONCiphertext {
    ephemeral_key: string;
    encrypted_chunks: string[];
    original_byte_length: number;
}
export declare function fullAONEncrypt(message: Uint8Array, pubKey: PubKey): AONCiphertext;
export declare function fullAONDecrypt(ciphertext: AONCiphertext, privKey: PrivKey): Uint8Array;
export declare function fullAONEncryptString(message: string, pubKey: PubKey): AONCiphertext;
export declare function fullAONDecryptString(ciphertext: AONCiphertext, privKey: PrivKey): string;
