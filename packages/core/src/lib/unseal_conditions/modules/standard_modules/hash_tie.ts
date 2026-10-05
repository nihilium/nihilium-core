import { ACTION_CHAIN_PROOF_VERIFY, ACTION_PASS_SIGNAL, ACTION_PREPARE_NEXT_PROOF, ACTION_VALIDATE_DATA_ROOT, ChainedProof, ProvingState } from "../../ChainedProof";
import { TopLevelTreeProof } from "../../proofs/lib/002_top_level_tree_proof";
import { MerkleTreeProof } from "../../proofs/lib/001_merkle_proof";
import { ProofMode } from "../../proofs/zk_proofs/types";
import { CompiledChainedProofCollection, UnsealProofAction } from "../../types";
import { IDualDataStream } from "../../../data_stream/types";
import { ethers, Signer } from "ethers";
import { UnsealOpeningProof } from "../../proofs/lib/000_unseal_opening_proof";
import { KeccakTreeEntryProof } from "../../proofs/lib/003_keccak_tree_entry";
import { ProofPath } from "fixed-merkle-tree";
import { ProcessorEndpoint } from "../../../../types/protocol/common";
import { createMimcMerkelTree, toPaddedHex, keccakTreeHasher } from "../../../utils";
import { hexToBytes } from "@noble/hashes/utils";
import { IOMap, ModuleEdge, ModuleEdgeInput, ModuleNode, ModuleProof, ProofProductionContext, UnsealConditionModule } from "../types";
import { UnsealConditionProof } from "../../proofs/types";
import { ProofLibraryType } from "../../proofs";
import { SmallerThanProof } from "../../proofs/lib/004_smaller_than";
import { GreaterOrEqualThenProof } from "../../proofs/lib/005_greater_or_equal";
import { TimeDelayProof } from "../../proofs/lib/006_time_delay";
import { circomHashTie, cryptoTools } from "@nihilium/zkp-circuits";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class HashTieModule extends UnsealConditionModule {

    // Deliberately not flagged per-processor. Whether this module's proof can be shared depends on
    // what the collection binds tied_value to, not on the module: bound to the opening module's
    // reveal_value it is per-processor, bound to its metadata_root_hash it is one proof for the whole
    // seal. UnsealPathProducer.perProcessorModuleIds works that out from the graph.



    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("HashTieModule", 
            "Hash Tie Verification", proofLibrary);
            this.description = `
                This module ties any value to a hash. It is a ZK module where you proof 
                you own a preimage of a hash and by doing so tie it to another value.
                The pre image is private as an input during proof generation
            `;
        this.inputs = {
           
            
            tied_value: {
                type_order: ["String"],
                user_input: false,
                description: "The value to tie to the hash",
                required: true
            },
           
        }
        
        
        
        var hash_tie_proof = proofLibrary.getProof("hash_tie");
        
        var hash_tie_proof_id = this.addProof(hash_tie_proof);
        this.addSignalEdge(undefined, hash_tie_proof_id, ["tied_value", "tied_value"], ModuleEdgeInput.external_input);      
        
    
        this.outputs = {
            tied_value: {
                type_order: ["String"],
                name: "tied_value",
                description: "The value that is tied to the hash",
                proof_key: hash_tie_proof_id,
                signal_key: "tied_value",
            },
            tied_hash: {
                type_order: ["String"],
                name: "tied_hash",
                description: "The hash that is tied to the value",
                proof_key: hash_tie_proof_id,
                signal_key: "tied_hash",
                // poseidon1 of the preimage, and the application picks one preimage per recovery, so
                // this is the same for every processor whatever the tied value is. Without this,
                // ZKEmailModule -- which binds its subject_value here -- would be reclassified
                // per-processor and its one shared proof would become k.
                per_processor: false,
            },
        }
    }
  

    async produce_proofs(preimage_hex: string, tied_value_hex: string): Promise<ModuleProof> {
        console.time("circomHashTie.proof");
        await circomHashTie.init()
        var proof = await circomHashTie.generateProof({input: {pre_image: preimage_hex, tied_value_input: tied_value_hex}});
        console.timeEnd("circomHashTie.proof");
        var return_proofs = ["0x" + cryptoTools.uint8ArrayToHex(proof.proof)];
        var return_public_inputs = [proof.publicSignals];

        // Emitted rather than left empty: tied_hash is what a downstream module binds to, and it can
        // only read it from here.
        return {
            proofs: return_proofs,
            public_inputs: return_public_inputs,
            outputs: this.obtain_outputs(return_public_inputs),
        }

    }

    /**
     * Only the preimage is application-supplied; the tied value comes from whatever the collection
     * binds this module's `tied_value` input to.
     */
    override productionInputs(): IOMap {
        return {
            preimage: { type_order: ["HexString"], user_input: true, required: true,
                description: "The hash-tie preimage (hex) chosen by the application" },
        };
    }

    /**
     * The tied value is the one the chain will substitute into the proof's `tied_value` signal, so
     * it has to be read from the graph rather than assumed. This used to always take the seal's
     * reveal_value, which is right only for a collection that wires `reveal_value -> tied_value`;
     * anything else (metadata_root_hash, say) proved over one value and verified against another.
     *
     * The fallback keeps direct callers and hand-built contexts working, and is exactly the old
     * behaviour. Normalized through BigInt because the two sources are textually different
     * renderings of the same field element -- public_package.reveal_value is already decimal, while
     * an upstream output is the raw public signal -- and the circom witness depends on the text.
     */
    override async produce(ctx: ProofProductionContext, inputs: { preimage: string }): Promise<ModuleProof> {
        const tied_value = ctx.bound_inputs?.tied_value ?? ctx.seal.public_package.reveal_value;
        return this.produce_proofs(inputs.preimage, BigInt(tied_value).toString());
    }

    

    
}