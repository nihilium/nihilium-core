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
import { timeStamp } from "console";
import { AddressMap } from "../../collections/types";




/**
 * Simplest possible proof collection.
 * Just proofs that a value is reference on chain.
 * 
 * NOTE: During collection creation we are not yet aware of the reveal value
 */

export class ZKEmailModule extends UnsealConditionModule {
    
    protected do_not_fork: boolean = true;
    

    constructor(
        proofLibrary: ProofLibraryType,
    ){
        super("ZKEmailModule", 
            "ZK Email Module", proofLibrary);
            this.description = `
                This module is used to validate a ZK Email.
                This module validates an email address and the content of the email header.
                Supports both 1024-bit and 2048-bit RSA DKIM keys.
                And on-chain verification of the hash of the DKIM key.
                
            `;
        this.inputs = {
            //This is a stwarting module so no link required
            // link: {
            //     type_order: [],
            //     user_input: false,
            //     description: "A simple link to define ordering",
            //     required: true
            // },
            timeStamp: {
                type_order: ["Timestamp"],
                user_input: false,
                description: "The timestamp to check against the registry",
                required: true
            },
            email_address_hash: {
                type_order: ["String"],
                user_input: true,
                description: "The hash of the email address",
                required: true
            },
            //Merkle proof of all zkpassport signals
            subject_value: {
                type_order: ["String"],
                user_input: false,
                description: "The value of the subject",
                required: true
            },
        }
        
        
        
        var zk_email_proof = proofLibrary.getProof("ZKEmailProof");
        
        var zk_email_proof_id = this.addProof(zk_email_proof);
        // mapping[0] is this module's declared input, mapping[1] the proof's public signal. The input is
        // "timeStamp" (as the collection's edge targets it), so naming it "timestamp" here left the
        // signal-pass looking up an input mapping that does not exist and the template never compiled.
        this.addSignalEdge(undefined, zk_email_proof_id, ["timeStamp", "timestamp"], ModuleEdgeInput.external_input);
        this.addSignalEdge(undefined, zk_email_proof_id, ["email_address_hash", "from_address_hash"], ModuleEdgeInput.user_input);      
        this.addSignalEdge(undefined, zk_email_proof_id, ["subject_value", "subject_value"], ModuleEdgeInput.external_input);      
    
        this.outputs = {
            dkim_key_hash: {
                name: "dkim_key_hash",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "dkim_key_hash",
                description: "The hash of the DKIM key",
            },
            subject_value: {
                name: "subject_value",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "subject_value",
                description: "The value of the subject",
            },
            from_address_hash: {
                name: "from_address_hash",
                type_order: ["String"],
                proof_key: zk_email_proof_id,
                signal_key: "from_address_hash",
                description: "The hash of the from adhdress",
            },
        }
    }
  

    async produce_proofs(inputs: ZKEmailIntegratedInputs): Promise<ModuleProof> {
        var return_proofs = [inputs.proof];
        
        var proof_key = inputs.proof_type === "RSA1024" ? "zk_email_proof_1024" : "zk_email_proof_2048";
        var proof_address = inputs.address_map.getAddress(proof_key);
        if (!proof_address) {
            throw new Error(`ZKEmailModule: the address map has no ${proof_key} address`);
        }
        // Every public signal is a bytes32, so the 20-byte address has to be left-padded like the rest —
        // the contract reads it back as address(uint160(uint256(publicSignals[1]))).
        var timestamp_and_proof_address = [toPaddedHex(BigInt(inputs.timestamp)), toPaddedHex(BigInt(proof_address))];
        var hexed_inputs = inputs.publicSignals.map(input => toPaddedHex(BigInt(input)));

        var return_public_inputs = [[...timestamp_and_proof_address, ...hexed_inputs]];

        return {proofs: return_proofs, public_inputs: return_public_inputs, outputs: this.obtain_outputs(return_public_inputs)}

    }

    /**
     * The ZKEmail proof, its public signals and which RSA key size produced it all come from the
     * external email flow (the app produces them out of band), so they are application-supplied.
     * The timestamp and the address map come from the protocol context instead.
     */
    override productionInputs(): IOMap {
        return {
            proof: { type_order: ["HexString"], user_input: true, required: true,
                description: "The ZKEmail proof (hex) produced by the email verification service" },
            publicSignals: { type_order: [["String"]], user_input: true, required: true,
                description: "The ZKEmail proof public signals" },
            proof_type: { type_order: ["String"], user_input: true, required: true,
                description: "Which verifier produced the proof: RSA1024 or RSA2048" },
        };
    }

    /**
     * `timestamp` and `address_map` are protocol context, not application input: the timestamp has to
     * be the opening proof's anchoring time (the chain substitutes that value into public signal 0 at
     * verify time), and the address map names the RSA verifier the proxy dispatches to. Both can still
     * be overridden through the resolver.
     */
    override async produce(ctx: ProofProductionContext, inputs: ZKEmailProductionInputs): Promise<ModuleProof> {
        const timestamp = inputs.timestamp ?? ctx.timestamp;
        const address_map = inputs.address_map ?? ctx.address_map;
        if (timestamp === undefined) {
            throw new Error(
                "ZKEmailModule: no proving timestamp. It must equal the opening proof's anchoring " +
                "timestamp — await the unsealing client's waitForProvingTimestamp() before producing.");
        }
        if (address_map === undefined) {
            throw new Error(
                "ZKEmailModule: no address map, so the RSA verifier address cannot be resolved. " +
                "Pass address_map (or network) to the unsealing client.");
        }
        return this.produce_proofs({ ...inputs, timestamp, address_map });
    }

    

    
}

type ZKEmailIntegratedInputs = {
    proof: string;
    publicSignals: any[];
    address_map: AddressMap;
    timestamp: number;
    proof_type: String;
}

/**
 * What a resolver actually has to supply: the timestamp and the address map are filled in from the
 * production context when omitted, which is the normal case.
 */
type ZKEmailProductionInputs = Omit<ZKEmailIntegratedInputs, "timestamp" | "address_map"> & {
    timestamp?: number;
    address_map?: AddressMap;
}