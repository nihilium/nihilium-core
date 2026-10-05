import { assert } from "chai";
import { StandardModuleLibrary } from "../src/lib/unseal_conditions/modules";
import { StandardProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { CollectionEdgeInput, BasicAddressMap } from "../src/lib/unseal_conditions/collections/types";
import { UnsealPathProducer } from "../src/lib/unseal_conditions/UnsealPathProducer";
import { HashTieModule } from "../src/lib/unseal_conditions/modules/standard_modules/hash_tie";
import { ZKPassportBirthdateModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKPassportBirthdate";
import { ZKEmailModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKEmail";
import { DefaultAnchoredOpeningProofModule } from "../src/lib/unseal_conditions/modules/standard_modules/default_anchored_opening_module";
import { ZKPassportBirthdateProof } from "../src/lib/unseal_conditions/proofs/zk_proofs/zkpassport_birthdate";
import { toPaddedHex } from "../src/lib/utils";
import { ModuleProof } from "../src/lib/unseal_conditions/modules/types";

/**
 * A module declares an input, the collection binds it to an upstream output, and the verifier
 * substitutes that upstream value into the proof's public-input slot before checking it. A module
 * that proves over a different value therefore produces a proof that cannot verify.
 *
 * HashTieModule used to ignore its declared `tied_value` entirely and always tie to the seal's
 * reveal_value. That is correct for exactly one wiring -- `reveal_value -> tied_value`, which the
 * zkEmail collection happens to use -- and silently wrong for any other. These tests pin both
 * halves: that the binding is read from the graph, and that the one existing collection which
 * relied on the old hardcoded value still resolves to that same value.
 */

function addressMap(): BasicAddressMap {
    const map = new BasicAddressMap({});
    let i = 1;
    for (const key of [
        "opening_proof", "TopLevelMerkleProof", "MerkleTreeProof", "KeccakTreeEntry", "hash_tie",
        "ZKPassportBirthdateProof", "ZkPassportCustomDataFormatProof",
        "ZKEmailProof", "zk_email_proof_1024", "zk_email_proof_2048", "zk_email_registry",
    ]) {
        map.addAddress(key, toPaddedHex(BigInt(i++), 20));
    }
    return map;
}

const REVEAL_VALUE = "7766554433221100";
const METADATA_ROOT_HASH = "1234567890123456";

/** What the opening module would have produced, with only the outputs the bindings read. */
function openingProof(): ModuleProof {
    return {
        proofs: [], public_inputs: [],
        outputs: { reveal_value: REVEAL_VALUE, metadata_root_hash: METADATA_ROOT_HASH },
    } as unknown as ModuleProof;
}

/** Compile with a filler value for every user input the template declares. */
function compiled(template: any) {
    const mapping: { [key: string]: bigint } = {};
    let filler = 1n;
    for (const input of (template.user_inputs ?? []).flat()) {
        mapping[input.input_signal_name] = filler++;
    }
    template.compile(mapping, { datastream: toPaddedHex(BigInt(1), 20) });
    return template;
}

/** `opening.<openingOutput> -> HashTie.tied_value -> ZKPassportBirthdate.random_value`. */
function passportGraph(openingOutput: "reveal_value" | "metadata_root_hash") {
    const proofLibrary = new StandardProofLibrary();
    const moduleLibrary = new StandardModuleLibrary();
    const collection = new UnsealConditionCollection(
        "passport", "test", proofLibrary, moduleLibrary, () => { /* noop */ });

    const opening = collection.add_node(new DefaultAnchoredOpeningProofModule(proofLibrary));
    const hashTie = collection.add_node(new HashTieModule(proofLibrary));
    const passport = collection.add_node(new ZKPassportBirthdateModule(proofLibrary));

    collection.add_edge(opening, hashTie, [openingOutput, "tied_value"], CollectionEdgeInput.signal_pass);
    collection.add_edge(hashTie, passport, ["tied_hash", "random_value"], CollectionEdgeInput.signal_pass);
    collection.add_data_stream("datastream", opening, "dual_merkle_root");

    const template = compiled(collection.createTemplate(addressMap()));
    return { template, producer: new UnsealPathProducer(template), opening, hashTie, passport };
}

/** `opening.reveal_value -> ZKPassportBirthdate.random_value`, with no HashTie interposed. */
function directPassportGraph() {
    const proofLibrary = new StandardProofLibrary();
    const moduleLibrary = new StandardModuleLibrary();
    const collection = new UnsealConditionCollection(
        "passport-direct", "test", proofLibrary, moduleLibrary, () => { /* noop */ });

    const opening = collection.add_node(new DefaultAnchoredOpeningProofModule(proofLibrary));
    const passport = collection.add_node(new ZKPassportBirthdateModule(proofLibrary));

    collection.add_edge(opening, passport, ["reveal_value", "random_value"], CollectionEdgeInput.signal_pass);
    collection.add_data_stream("datastream", opening, "dual_merkle_root");

    const template = compiled(collection.createTemplate(addressMap()));
    return { template, producer: new UnsealPathProducer(template), opening, passport };
}

/** The shipped zkEmail wiring, which must keep resolving to the reveal value. */
function zkEmailGraph() {
    const proofLibrary = new StandardProofLibrary();
    const moduleLibrary = new StandardModuleLibrary();
    const collection = new UnsealConditionCollection(
        "zkemail", "test", proofLibrary, moduleLibrary, () => { /* noop */ });

    const opening = collection.add_node(new DefaultAnchoredOpeningProofModule(proofLibrary));
    const hashTie = collection.add_node(new HashTieModule(proofLibrary));
    const zkEmail = collection.add_node(new ZKEmailModule(proofLibrary));

    collection.add_edge(opening, hashTie, ["reveal_value", "tied_value"], CollectionEdgeInput.signal_pass);
    collection.add_edge(opening, zkEmail, ["timestamp", "timeStamp"], CollectionEdgeInput.signal_pass);
    collection.add_edge(hashTie, zkEmail, ["tied_hash", "subject_value"], CollectionEdgeInput.signal_pass);
    collection.add_data_stream("datastream", opening, "dual_merkle_root");

    const template = compiled(collection.createTemplate(addressMap()));
    return { template, producer: new UnsealPathProducer(template), opening, hashTie, zkEmail };
}

/** Resolve one node's bindings against a prepopulated upstream. */
function bindingsFor(
    producer: UnsealPathProducer, node_id: string, upstream: { [id: string]: ModuleProof },
) {
    const entry = producer.modulesForPath(0).find((m) => m.compiled_module.module_id === node_id);
    assert.isDefined(entry, `path 0 has no node ${node_id}`);
    return producer.resolveBindings(
        0, entry!.compiled_module, entry!.module, upstream, producer.perProcessorModuleIds(0));
}

describe("bound inputs", () => {

    it("hands HashTie the reveal value when the collection binds reveal_value", () => {
        const { producer, opening, hashTie } = passportGraph("reveal_value");
        const bound = bindingsFor(producer, hashTie, { [opening]: openingProof() });

        assert.equal(bound.tied_value, REVEAL_VALUE);
    });

    it("hands HashTie the metadata root hash when the collection binds that instead", () => {
        const { producer, opening, hashTie } = passportGraph("metadata_root_hash");
        const bound = bindingsFor(producer, hashTie, { [opening]: openingProof() });

        // The bug this fixes: the old produce() ignored the declared input and tied to the reveal
        // value regardless, so the chain substituted one value and the proof carried another.
        assert.equal(bound.tied_value, METADATA_ROOT_HASH);
        assert.notEqual(bound.tied_value, REVEAL_VALUE);
    });

    it("keeps the shipped zkEmail wiring on the reveal value", () => {
        const { producer, opening, hashTie } = zkEmailGraph();
        const bound = bindingsFor(producer, hashTie, { [opening]: openingProof() });

        // The regression net. This collection is in production; its HashTie proof must carry exactly
        // what it carried before bindings existed, or every existing zkEmail seal stops opening.
        assert.equal(bound.tied_value, REVEAL_VALUE);
    });

    it("emits HashTie's outputs, so a downstream module can bind to tied_hash", async () => {
        // Nothing downstream can read tied_hash unless HashTie puts it in its ModuleProof; it used
        // to return an empty outputs map, which made the passport graph unresolvable.
        const proofLibrary = new StandardProofLibrary();
        const module = new HashTieModule(proofLibrary);
        const outputs = module.obtain_outputs([["0xaa", "0xbb"]]);

        assert.equal(outputs.tied_hash, "0xaa");
        assert.equal(outputs.tied_value, "0xbb");
    });

    it("omits a binding the graph does not make", () => {
        const { producer, opening, hashTie } = passportGraph("reveal_value");
        // merkle_data_commitment is a user input, compiled into the template, never substituted.
        const bound = bindingsFor(producer, hashTie, { [opening]: openingProof() });

        assert.deepEqual(Object.keys(bound), ["tied_value"]);
    });

    it("omits a binding whose upstream has not produced yet", () => {
        const { producer, hashTie } = passportGraph("metadata_root_hash");
        const bound = bindingsFor(producer, hashTie, {});

        // Absent rather than undefined-valued: the module's `?? reveal_value` fallback is what runs.
        assert.deepEqual(bound, {});
    });

    describe("ZKPassportClaimModule.produce", () => {
        const CLAIM = toPaddedHex(BigInt("0xa9e"));
        const NAME = toPaddedHex(BigInt("0x4a3e"));
        const CUSTOM = toPaddedHex(BigInt("0xc05704a"));

        function signals() {
            const out = Array.from({ length: 12 }, (_, i) => toPaddedHex(BigInt(i)));
            out[ZKPassportBirthdateProof.getSignalIndex("birthdate")[0] - 1] = CLAIM;
            out[ZKPassportBirthdateProof.getSignalIndex("name")[0] - 1] = NAME;
            out[ZKPassportBirthdateProof.getSignalIndex("custom_data")[0] - 1] = CUSTOM;
            return out;
        }

        const inputs = {
            commitments: { leaves: [CLAIM, NAME], custom_data: [CUSTOM] },
            zkpassport_proof: "0xdead",
            zkpassport_signals: signals(),
            vkey_hash: "0x" + "ab".repeat(32),
        };
        const seal = { public_package: { reveal_value: REVEAL_VALUE } };

        it("binds custom_data to the value the graph supplies", async () => {
            const module = new ZKPassportBirthdateModule(new StandardProofLibrary());
            const result = await module.produce(
                { seal, bound_inputs: { random_value: METADATA_ROOT_HASH } } as any, inputs as any);

            // public_inputs[0] is the FormatBoundData proof: [commitment, the bound value].
            assert.equal(result.public_inputs[0][1], toPaddedHex(BigInt(METADATA_ROOT_HASH)));
        });

        it("falls back to the seal's reveal value when the graph binds nothing", async () => {
            const module = new ZKPassportBirthdateModule(new StandardProofLibrary());
            const result = await module.produce({ seal } as any, inputs as any);

            assert.equal(result.public_inputs[0][1], toPaddedHex(BigInt(REVEAL_VALUE)));
        });
    });

    /**
     * Which modules must be produced once per processor, and which can be produced once and reused.
     *
     * Classified per output, not per module: the opening module is per-processor because its proof
     * binds that processor's reveal_value, but its metadata_root_hash is one value for the whole
     * seal, and HashTie's tied_hash is poseidon1 of one preimage per recovery. Getting this wrong in
     * either direction is expensive -- too strict and a shared ZK proof becomes k of them, too loose
     * and one processor's data is silently bound into a proof used for all of them.
     */
    describe("per-processor classification", () => {

        it("keeps zkEmail's proof shared", () => {
            const { producer, opening, hashTie, zkEmail } = zkEmailGraph();
            const ids = producer.perProcessorModuleIds(0);

            // The regression net for the shipped collection. HashTie binds the per-processor
            // reveal_value so it stays per-processor; ZKEmail binds only tied_hash and timestamp,
            // both seal-wide, so its one expensive proof is still produced once.
            assert.isTrue(ids.has(opening));
            assert.isTrue(ids.has(hashTie));
            assert.isFalse(ids.has(zkEmail), "the zkEmail proof must not become one per processor");
        });

        it("keeps the passport proof per-processor with no HashTie interposed", () => {
            const { producer, opening, passport } = directPassportGraph();
            const ids = producer.perProcessorModuleIds(0);

            // custom_data binds straight to this processor's reveal_value, so the proof genuinely
            // differs per processor and a k-of-n seal costs k passport scans. This is the only
            // passport wiring for which that is true.
            assert.isTrue(ids.has(opening));
            assert.isTrue(ids.has(passport));
        });

        it("shares the passport proof behind a HashTie, whatever the HashTie ties to", () => {
            const { producer, opening, hashTie, passport } = passportGraph("reveal_value");
            const ids = producer.perProcessorModuleIds(0);

            // tied_hash is poseidon1 of one preimage chosen per recovery, so it is the same for
            // every processor even here, where HashTie itself is per-processor because it ties to
            // the reveal value. Interposing a HashTie is what buys a single passport scan; binding
            // it to the metadata root additionally shares the HashTie proof. This is the same
            // mechanism that keeps zkEmail's proof shared.
            assert.isTrue(ids.has(opening));
            assert.isTrue(ids.has(hashTie), "it ties to the per-processor reveal value");
            assert.isFalse(ids.has(passport), "one passport scan already serves every processor");
        });

        it("shares the passport proof when it binds the seal-wide metadata root", () => {
            const { producer, opening, hashTie, passport } = passportGraph("metadata_root_hash");
            const ids = producer.perProcessorModuleIds(0);

            // The feature: one HashTie proof and one passport scan for any k, because the value the
            // proof is bound to is the same for every processor.
            assert.isTrue(ids.has(opening), "the opening proof is always per-processor");
            assert.isFalse(ids.has(hashTie));
            assert.isFalse(ids.has(passport), "one passport scan must serve every processor");
        });
    });
});
