
import { toPaddedHex } from "../../../utils";
import { ModuleEdge, ModuleEdgeInput, ModuleNode, ModuleProof, UnsealConditionModule } from "../types";
import { ProofLibraryType } from "../../proofs";
import { GreaterOrEqualThenProof } from "../../proofs/lib/005_greater_or_equal";
import { UnsealConditionProof } from "../../proofs/types";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class BeforeTimeModule extends UnsealConditionModule {
    
   
    
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("BeforeTimeModule", 
            "Before Time Module", proofLibrary);
            this.description = `
                This module is used to validate that a timestamp is before a certain time.
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            timestamp: {
                type_order: ["Timestamp", "Number"],
                user_input: false,
                description: "The timestamp to check",
                required: true
            },
            threshold: {
                type_order: ["Timestamp", "Number"],
                user_input: true,
                description: "The threshold timestamp",
                required: true
            },
        }
        
        
        
        var greater_or_equal_then_proof = proofLibrary.getProof("GreaterOrEqualThen");
        var greater_or_equal_then_proof_id = this.addProof(greater_or_equal_then_proof);

        this.addSignalEdge(undefined, greater_or_equal_then_proof_id, ["timestamp", "timestamp"], ModuleEdgeInput.external_input);
        this.addSignalEdge(undefined, greater_or_equal_then_proof_id, ["threshold", "threshold"], ModuleEdgeInput.user_input);
            
    
        this.outputs = {
           
        }
    }
  

    async produce_proofs(timestamp: bigint, threshold: bigint): Promise<ModuleProof> {
        var return_proofs = ["0x"];
        if(timestamp >= threshold) {
            throw new Error("Timestamp is not smaller than threshold");
        }
        var return_public_inputs = [[toPaddedHex(timestamp), toPaddedHex(threshold)]];
        
        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: {}}

    }

    

    
}