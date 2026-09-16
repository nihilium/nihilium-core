import { ModuleEdgeInput, IOMap, ModuleProof, ProofProductionContext, UnsealConditionModule } from "../types";
import { UnsealConditionProof } from "../../proofs/types";
import { ProofLibraryType } from "../../proofs";
import { ZKPASSPORT_ROUTING_PREFIX_LENGTH } from "../../proofs/zk_proofs/zkpassport_common";
import { createKeccakMerkelTreeSync, toPaddedHex } from "../../../utils";

/** Depth of the keccak tree over the candidate signal commitments. */
const SIGNAL_TREE_DEPTH = 8;

/**
 * The commitment material a caller has to supply. Deriving it needs ZKPassport's own EVM parameter
 * commitment functions, which is why it is an input rather than something this module computes:
 * @nihilium/core takes no ZKPassport dependency. See @nihilium/client-sdk/zkpassport, whose
 * getSignalLeaves() is the single definition of `leaves` and its ordering.
 */
export type ZKPassportCommitments = {
    /**
     * Candidate signal commitments forming the merkle tree, in the order used at seal time. The
     * root of this tree is the module's merkle_data_commitment user input, so a different ordering
     * here produces a different root and the unseal fails.
     */
    leaves: string[];
    /** Candidate commitments for the bound custom_data. [0] is committed to; the set is checked. */
    custom_data: string[];
};

export type ZKPassportProductionInputs = {
    commitments: ZKPassportCommitments;
    zkpassport_proof: any;
    /** The circuit's own public inputs, unprefixed, exactly as the ZKPassport SDK returns them. */
    zkpassport_signals: any[];
    /** The circuit's verification-key hash; routes ZKPassportProofProxy to the Honk verifier. */
    vkey_hash: string;
};

/**
 * Gates an unseal on a ZKPassport disclosure proof.
 *
 * The passport proof is bound to this seal by its custom_data: the opening module's anchored
 * reveal_value is fed in as random_value, committed through FormatBoundData, and the passport proof
 * must carry that same commitment. A proof therefore opens exactly one seal, and cannot be replayed
 * against another.
 *
 * The disclosed age and name are proven to be members of a set the sealer committed to at seal
 * time (merkle_data_commitment). The set is candidates rather than a single value because the
 * sealer cannot know which MRZ encoding a given passport uses.
 */
export abstract class ZKPassportClaimModule extends UnsealConditionModule {

    /**
     * custom_data binds to the per-processor reveal_value, and every package carries a different
     * one, so this proof cannot be shared across processors -- the same reason HashTieModule sets
     * it. A k-of-n seal would need k passport scans; putting a HashTieModule between the opening
     * module and this one (as the ZKEmail collection does) would make it shareable again.
     */
    override requires_unique_proof_per_processor: boolean = true;

    private zkPassportProof: UnsealConditionProof;
    /** The descriptor's name for slot 6: the claim this module gates on. */
    protected readonly claimSignal: string;

    constructor(
        proofLibrary: ProofLibraryType,
        options: {
            /** Module name, which is what the scenario editor and collection JSON use. */
            name: string;
            shortDescription: string;
            /** Address-map key of this claim's proof descriptor. */
            proofKey: string;
            /** The descriptor's name for parameter-commitment slot 6 -- "age", "birthdate". */
            claimSignal: string;
            description: string;
        },
    ) {
        super(options.name, options.shortDescription, proofLibrary);
        this.claimSignal = options.claimSignal;
        this.description = options.description;
        this.inputs = {
            random_value: {
                type_order: ["Randomness"],
                user_input: false,
                description: "Random value the passport proof's custom_data must be bound to; comes from a randomness source",
                required: true,
            },
            merkle_data_commitment: {
                type_order: ["String"],
                user_input: true,
                description: "Merkle root over every signal commitment the passport is allowed to produce",
                required: true,
            },
        };

        // Order matters: a proof can only reference signals from proofs added before it.
        this.zkPassportProof = proofLibrary.getProof(options.proofKey);
        const boundDataProofId = this.addProof(proofLibrary.getProof("ZkPassportCustomDataFormatProof"));
        const claimTreeProofId = this.addProof(proofLibrary.getProof("MerkleTreeProof"));
        const nameTreeProofId = this.addProof(proofLibrary.getProof("MerkleTreeProof"));
        const zkPassportProofId = this.addProof(this.zkPassportProof);

        // The reveal value becomes the bound-data commitment.
        this.addSignalEdge(undefined, boundDataProofId, ["random_value", "custom_data"], ModuleEdgeInput.external_input);
        // Both membership proofs are checked against the sealer's committed root.
        this.addSignalEdge(undefined, claimTreeProofId, ["merkle_data_commitment", "merkle_root"], ModuleEdgeInput.user_input);
        this.addSignalEdge(undefined, nameTreeProofId, ["merkle_data_commitment", "merkle_root"], ModuleEdgeInput.user_input);
        // The proven members must be the values the passport proof actually disclosed.
        this.addSignalEdge(claimTreeProofId, zkPassportProofId, ["leaf_value", this.claimSignal], ModuleEdgeInput.signal_pass);
        this.addSignalEdge(nameTreeProofId, zkPassportProofId, ["leaf_value", "name"], ModuleEdgeInput.signal_pass);
        // And the bound-data commitment must be the one the passport proof carries.
        this.addSignalEdge(boundDataProofId, zkPassportProofId, ["custom_data_commitment", "custom_data"], ModuleEdgeInput.signal_pass);

        this.outputs = {
            link: {
                name: "link",
                type_order: ["Other"],
                proof_key: zkPassportProofId,
                signal_key: "vkey_hash",
                description: "A simple link to define ordering between modules when no signal is passed",
            },
            custom_data: {
                name: "custom_data",
                type_order: ["String"],
                proof_key: zkPassportProofId,
                signal_key: "custom_data",
                description: "The bound-data commitment the passport proof carries",
            },
        };
    }

    /**
     * Two index spaces are in play, and mixing them is silent:
     *   raw      -- the ZKPassport SDK's public input array and the commitment candidates.
     *   prefixed -- what goes on chain: [vkey_hash, ...raw], which is what public_signals declares.
     * ZKPassportProofProxy routes on prefixed[0] and hands prefixed[1:] to the Honk verifier.
     */
    private rawIndex(signal: string): number {
        return this.zkPassportProof.getSignalIndex(signal)[0] - ZKPASSPORT_ROUTING_PREFIX_LENGTH;
    }

    async produce_proofs(
        reveal_value: string,
        commitments: ZKPassportCommitments,
        zkpassport_proof: any,
        zkpassport_signals: any[],
        vkey_hash: string,
    ): Promise<ModuleProof> {
        const return_proofs: any[] = [];
        const return_public_inputs: any[][] = [];

        const reveal_value_hex = toPaddedHex(BigInt(reveal_value.toString()));
        const prefixed_signals = [vkey_hash, ...zkpassport_signals];

        // Rebuilt from the caller's leaves rather than recomputed, so this root is the one the
        // sealer committed to. Any reordering upstream shows up here as a failed membership proof.
        const tree = createKeccakMerkelTreeSync(SIGNAL_TREE_DEPTH, commitments.leaves);

        const claimSignal = zkpassport_signals[this.rawIndex(this.claimSignal)];
        const nameSignal = zkpassport_signals[this.rawIndex("name")];
        const customDataSignal = zkpassport_signals[this.rawIndex("custom_data")];

        if (!commitments.custom_data.includes(customDataSignal)) {
            throw new Error(
                `${this.name}: the proof's custom_data is not among the committed candidates. ` +
                "The passport proof is not bound to this seal's reveal value.");
        }
        if (tree.indexOf(claimSignal) < 0 || tree.indexOf(nameSignal) < 0) {
            throw new Error(
                `${this.name}: the disclosed ${this.claimSignal} or name is not in the committed ` +
                "signal set. The passport does not match the identity this seal was created for.");
        }

        // 1. The bound-data commitment. Verified from public signals alone, so the proof is empty.
        return_proofs.push("0x");
        return_public_inputs.push([commitments.custom_data[0], reveal_value_hex]);

        // 2 and 3. Membership of the disclosed claim and name in the committed set.
        for (const signal of [claimSignal, nameSignal]) {
            const merkle_proof = tree.proof(signal);
            return_proofs.push(
                "0x" + merkle_proof.pathElements
                    .map((element) => toPaddedHex(BigInt(element.toString())).slice(2))
                    .join(""));
            return_public_inputs.push([
                merkle_proof.pathRoot,
                signal,
                toPaddedHex(BigInt(tree.indexOf(signal))),
            ]);
        }

        // 4. The passport proof itself, with the routing signal prefixed.
        return_proofs.push(zkpassport_proof);
        return_public_inputs.push(prefixed_signals);

        return {
            proofs: return_proofs,
            public_inputs: return_public_inputs,
            outputs: this.obtain_outputs(return_public_inputs),
        };
    }

    /**
     * What the application must supply. The commitments need ZKPassport's own parameter-commitment
     * functions to derive, and the proof comes from the user's phone -- none of it is knowable
     * from the protocol context.
     */
    override productionInputs(): IOMap {
        return {
            commitments: {
                type_order: ["Other"], user_input: true, required: true,
                description: "Candidate signal commitments: { leaves, custom_data }. See @nihilium/client-sdk/zkpassport",
            },
            zkpassport_proof: {
                type_order: ["HexString"], user_input: true, required: true,
                description: "The ZKPassport Solidity verifier proof produced by the ZKPassport app",
            },
            zkpassport_signals: {
                type_order: [["String"]], user_input: true, required: true,
                description: "The ZKPassport proof's public inputs, unprefixed",
            },
            vkey_hash: {
                type_order: ["HexString"], user_input: true, required: true,
                description: "The circuit's verification-key hash; routes the proxy to the right Honk verifier",
            },
        };
    }

    /**
     * The reveal value is protocol context, not application input: it is this processor's package's
     * anchored value, and custom_data is bound to it. Taken from ctx for the same reason
     * HashTieModule does, so the application never has to thread it through.
     */
    override async produce(ctx: ProofProductionContext, inputs: ZKPassportProductionInputs): Promise<ModuleProof> {
        return this.produce_proofs(
            ctx.seal.public_package.reveal_value,
            inputs.commitments,
            inputs.zkpassport_proof,
            inputs.zkpassport_signals,
            inputs.vkey_hash,
        );
    }
}
