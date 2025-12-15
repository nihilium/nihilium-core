import { ethers, keccak256, Signer, toBeHex } from "ethers";
import MerkleTree from "fixed-merkle-tree";
import { buildMimc7 } from "circomlibjs";
import jwtTools from "jsonwebtoken";
import { HexString } from "ethers/lib.commonjs/utils/data";

export function toPaddedHex(bn: bigint, length = 32): string {
    return ethers.zeroPadValue(toBeHex(bn), length);
}
//The value of a mimc hash of (42n, 42n)
export const ZERO = 7507787612525723758659662260399184323980001748885802124580171315331567144978n
export const ZERO_KECCAK = "0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6"
var mimc:any = null;

/**
 * The the MimC tree hash function,
 * If wanting to hash a single value set right to 0n
 * @param left 
 * @param right 
 * @returns 
 */
export var treeHasher:(left: any, right: any) => any = (left: any, right: any) => {
    return "";
};
/**
 * Creates a merkle tree with the mimc hash function from circomlibjs
 * @param depth 
 * @param leaves 
 * @returns 
 */
export var keccakTreeHasher:(left: any, right: any) => any = (left: any, right: any) => {
    return keccak256(toPaddedHex(left) + toPaddedHex(right).slice(2));
};

export async function createMimcMerkelTree(depth: number, leaves: string[]): Promise<MerkleTree> {
    if(mimc == null){
        mimc = await buildMimc7();
    }
    treeHasher = (left: any, right: any): string => {
        var pos = mimc.hash(BigInt(left), BigInt(right))
        var curvePoint = mimc.F.toString(pos)           
        return curvePoint;
    }
    const tree = new MerkleTree(depth, leaves, {hashFunction: treeHasher, zeroElement: ZERO.toString()});
    return tree;
}




export async function createKeccakMerkelTree(depth: number, leaves: string[]): Promise<MerkleTree> {
    
    const tree = new MerkleTree(depth, [ZERO_KECCAK], {hashFunction: keccakTreeHasher, zeroElement: ZERO_KECCAK});
    tree.bulkInsert(leaves)
   
    return tree;
}


export async function signDataInsertRequestJWT(data:  HexString[], global_tree_index: number, inserted_at: number ,secret: Signer): Promise<string> {



    var data_hash = keccak256(ethers.solidityPacked(
        
        ["bytes32[]", "uint256", "uint256"],
        [data.map(d => toPaddedHex(BigInt(d))), global_tree_index, inserted_at]
    ));
    

    return await secret.signMessage(data_hash);
}
