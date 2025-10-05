import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_START_UNSEALING, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../base_functions/ChainedProof";
import { TopLevelTreeProof } from "../base_functions/zk_proofs/002_top_level_tree_proof";
import { SubTreeProof } from "../base_functions/zk_proofs/001_sub_tree_proof";
import { ProofMode } from "../base_functions/zk_proofs/types";
import { ChainedProofCollection, UnsealProofAction } from "./types";
import { IDataStream } from "../../data_stream/types";
import { ethers, Signer } from "ethers";
import { UnsealOpeningProof } from "../base_functions/zk_proofs/000_unseal_opening_proof";
import { ProofPath } from "fixed-merkle-tree";
import { ProcessorEndpoint } from "../../../types/protocol/common";
import { treeHasher } from "../../utils";






/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class GenericVerifyCollection extends ChainedProofCollection {
    
   
    protected chainedProof:ChainedProof;
    private opening_proof:UnsealOpeningProof;
   
 
    protected unseal_proof_actions: UnsealProofAction[] = []

    constructor(       
        datastreams: IDataStream[],
        opening_proof_address: string,
        forced_opening_address: string, //Not doing anything yet
        unseal_proof_actions: UnsealProofAction[],
        provider: ethers.Provider,
        signer: Signer | undefined = undefined
    ){
        super(opening_proof_address, datastreams, provider, signer);
        this.opening_proof_address = opening_proof_address;
        this.opening_proof = new UnsealOpeningProof(this.opening_proof_address);
        this.chainedProof = new ChainedProof(this.opening_proof_address, forced_opening_address, provider, signer);
        
        this.unseal_proof_actions =unseal_proof_actions;
        
    }

    async initialize(): Promise<void> {
        await this.chainedProof.initializeSolidity();
    }

    async produce_proofs(dataStream: IDataStream, processor:ProcessorEndpoint, opening_proof:any, opening_public_inputs: any[]): Promise<any> {
        

        return {proofs: [], public_inputs: []}

    }


    override getConstructorFields(): {[key:string]:any} {    
        return {
          
        }
    }

    override getCollectionId(): string {
        return "generic_verify_collection";
    }
    
}