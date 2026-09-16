import { assert, expect } from "chai";
import { StandardModuleLibrary } from "../src/lib/unseal_conditions/modules";
import { StandardProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { ZKPassportAgeModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKPassportAge";
import { ZKPassportBirthdateModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKPassportBirthdate";
import { ZKPassportMinimumAgeModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKPassportMinimumAge";
import { ZKPassportClaimModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKPassportClaim";
import { DefaultAnchoredOpeningProofModule } from "../src/lib/unseal_conditions/modules/standard_modules/default_anchored_opening_module";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { CollectionEdgeInput, BasicAddressMap } from "../src/lib/unseal_conditions/collections/types";
import { ZKPassportAgeProof } from "../src/lib/unseal_conditions/proofs/zk_proofs/zkpassport_age";
import { ZKPassportBirthdateProof } from "../src/lib/unseal_conditions/proofs/zk_proofs/zkpassport_birthdate";
import { createKeccakMerkelTreeSync, toPaddedHex } from "../src/lib/utils";

/** Every address the ZKPassport collection compiles against, so the template resolves. */
function addressMap(): BasicAddressMap {
    const map = new BasicAddressMap({});
    let i = 1;
    for (const key of [
        "opening_proof", "TopLevelMerkleProof", "MerkleTreeProof", "KeccakTreeEntry",
        "ZKPassportAgeProof", "ZKPassportBirthdateProof", "ZkPassportCustomDataFormatProof",
    ]) {
        map.addAddress(key, toPaddedHex(BigInt(i++), 20));
    }
    return map;
}

function buildCollection(
    moduleLibrary: StandardModuleLibrary,
    proofLibrary: StandardProofLibrary,
    module: ZKPassportClaimModule = new ZKPassportAgeModule(proofLibrary),
) {
    const collection = new UnsealConditionCollection(
        "ZKPassportGated", "test", proofLibrary, moduleLibrary, () => { /* noop */ });
    const openingNodeId = collection.add_node(new DefaultAnchoredOpeningProofModule(proofLibrary));
    const zkPassportNodeId = collection.add_node(module);
    collection.add_edge(openingNodeId, zkPassportNodeId, ["reveal_value", "random_value"],
        CollectionEdgeInput.signal_pass);
    collection.add_data_stream("datastream", openingNodeId, "dual_merkle_root");
    return { collection, openingNodeId, zkPassportNodeId };
}

describe("ZKPassport modules", () => {

    it("resolves both claim modules by name, and neither is a dummy", () => {
        const moduleLibrary = new StandardModuleLibrary();
        const proofLibrary = new StandardProofLibrary();

        const age = moduleLibrary.getModule("ZKPassportAgeModule", proofLibrary);
        const birthdate = moduleLibrary.getModule("ZKPassportBirthdateModule", proofLibrary);
        const minimumAge = moduleLibrary.getModule("ZKPassportMinimumAgeModule", proofLibrary);

        assert.instanceOf(age, ZKPassportAgeModule);
        assert.instanceOf(birthdate, ZKPassportBirthdateModule);
        assert.instanceOf(minimumAge, ZKPassportMinimumAgeModule);
        // The editor offers them as separate choices, so they must not collapse into one another.
        assert.notInstanceOf(minimumAge, ZKPassportAgeModule);
        for (const module of [age, birthdate, minimumAge]) {
            assert.isTrue(module.requires_unique_proof_per_processor,
                "custom_data binds to the per-processor reveal_value");
        }
    });

    it("gives each module a description that says when to reach for it", () => {
        const proofLibrary = new StandardProofLibrary();
        const age = new ZKPassportAgeModule(proofLibrary).description;
        const birthdate = new ZKPassportBirthdateModule(proofLibrary).description;
        const minimumAge = new ZKPassportMinimumAgeModule(proofLibrary).description;

        // The editor shows these, and the whole point of the split is that they steer the choice.
        assert.match(age, /ZKPassportBirthdateModule/, "age module must point at the alternative");
        assert.match(birthdate, /ZKPassportAgeModule/, "birthdate module must point at the alternative");
        assert.match(age, /MOVES OVER TIME/, "the drift is the distinguishing property");
        assert.match(minimumAge, /ZKPassportBirthdateModule/, "minimum-age must point at the fixed cut-off");
        assert.match(minimumAge, /atLeastAge/, "minimum-age must name the helper that commits (n, 0)");
        assert.match(minimumAge, /MOVES OVER TIME/, "the drift applies here too, benignly");
    });

    it("keeps the two proof descriptors distinct in the library", () => {
        // StandardProofLibrary keys by addressMapKey, so a shared key would mean one silently
        // overwriting the other.
        const proofLibrary = new StandardProofLibrary();
        assert.notEqual(ZKPassportAgeProof.data.addressMapKey, ZKPassportBirthdateProof.data.addressMapKey);
        assert.equal(proofLibrary.getProof("ZKPassportAgeProof"), ZKPassportAgeProof);
        assert.equal(proofLibrary.getProof("ZKPassportBirthdateProof"), ZKPassportBirthdateProof);
    });

    it("gates the minimum-age module on the age descriptor, so it needs no new address", () => {
        // Same circuit, same slot 6, same deployed contract. Only the committed leaf set differs,
        // and that lives with the sealer -- so there is nothing extra to deploy or alias.
        const proofLibrary = new StandardProofLibrary();
        assert.equal(proofLibrary.getProof("ZKPassportAgeProof"), ZKPassportAgeProof);
        expect(() => proofLibrary.getProof("ZKPassportMinimumAgeProof")).to.throw(/not found/);
    });

    it("names slot 6 for the claim each proof gates on", () => {
        assert.equal(ZKPassportAgeProof.getSignalIndex("age")[0], 6);
        assert.equal(ZKPassportBirthdateProof.getSignalIndex("birthdate")[0], 6);
        assert.isUndefined(ZKPassportAgeProof.getSignalIndex("birthdate"));
        assert.isUndefined(ZKPassportBirthdateProof.getSignalIndex("age"));
        // Everything else is the same circuit.
        for (const signal of ["vkey_hash", "current_date", "name", "custom_data", "nullifier"]) {
            assert.deepEqual(
                ZKPassportAgeProof.getSignalIndex(signal),
                ZKPassportBirthdateProof.getSignalIndex(signal), signal);
        }
    });

    it("refuses a custom registration that could never be reached", () => {
        const moduleLibrary = new StandardModuleLibrary();
        expect(() => moduleLibrary.addCustomModule("ZKPassportAgeModule", ZKPassportAgeModule))
            .to.throw(/already a standard module/);
        // A free name is still fine.
        moduleLibrary.addCustomModule("SomeOtherModule", ZKPassportAgeModule);
    });

    for (const [label, proof] of [["age", ZKPassportAgeProof], ["birthdate", ZKPassportBirthdateProof]] as const) {
        it(`declares a ${label} signal map that contiguously covers the runtime array`, () => {
            // ChainedProofV2 builds its flat output list from getOutputSize() while the contract
            // appends the real array; a gap here misaligns every later index.
            const covered = new Set<number>();
            for (const [start, length] of Object.values(proof.getPublicSignals())) {
                for (let i = 0; i < length; i++) covered.add(start + i);
            }
            const size = proof.getOutputSize();
            assert.equal(covered.size, size, "declared signals must not overlap");
            for (let i = 0; i < size; i++) {
                assert.isTrue(covered.has(i), `signal index ${i} is not declared`);
            }
            // One routing signal plus the circuit's twelve public inputs.
            assert.equal(size, 13);
        });
    }

    for (const label of [
        "ZKPassportAgeModule", "ZKPassportBirthdateModule", "ZKPassportMinimumAgeModule",
    ] as const) {
        it(`compiles a ${label} collection and keys user inputs by node`, () => {
            const moduleLibrary = new StandardModuleLibrary();
            const proofLibrary = new StandardProofLibrary();
            const module = moduleLibrary.getModule(label, proofLibrary) as ZKPassportClaimModule;
            const { collection, zkPassportNodeId } = buildCollection(moduleLibrary, proofLibrary, module);

            const template = collection.createTemplate(addressMap());
            const declared = (template.user_inputs ?? []).flat().map((u: any) => u.input_signal_name);
            assert.include(declared, `${zkPassportNodeId}:merkle_data_commitment`);
        });

        it(`survives a ${label} JSON round trip through the standard library`, () => {
            const moduleLibrary = new StandardModuleLibrary();
            const proofLibrary = new StandardProofLibrary();
            const module = moduleLibrary.getModule(label, proofLibrary) as ZKPassportClaimModule;
            const { collection } = buildCollection(moduleLibrary, proofLibrary, module);
            const exported = collection.export_to_json();

            const node = exported.nodes.find((n: any) => n.module_name === label);
            assert.isDefined(node, `the exported JSON must name ${label}`);

            const reimported = new UnsealConditionCollection(
                exported.name, exported.description, proofLibrary, moduleLibrary, () => { /* noop */ });
            reimported.import_from_json(exported);
            reimported.add_data_stream("datastream", exported.starting_node, "dual_merkle_root");
            assert.isDefined(reimported.createTemplate(addressMap()));
        });
    }

    // Both claim modules share ZKPassportClaimModule's body, so the production tests run against
    // each and assert the one thing that genuinely differs: which slot name it reads.
    const CLAIMS = [
        { module: "Age", label: "age", proof: ZKPassportAgeProof,
          make: (l: StandardProofLibrary) => new ZKPassportAgeModule(l) },
        { module: "Birthdate", label: "birthdate", proof: ZKPassportBirthdateProof,
          make: (l: StandardProofLibrary) => new ZKPassportBirthdateModule(l) },
        // Same claim slot and same proof descriptor as Age; what differs is the leaf set the
        // sealer commits to, which this layer never sees. Run it through anyway so the marshalling
        // cannot drift from its sibling.
        { module: "MinimumAge", label: "age", proof: ZKPassportAgeProof,
          make: (l: StandardProofLibrary) => new ZKPassportMinimumAgeModule(l) },
    ] as const;

    for (const { module, label, proof, make } of CLAIMS) {
        describe(`produce_proofs (${module})`, () => {
            const proofLibrary = new StandardProofLibrary();
            const REVEAL = "0x" + "11".repeat(32);
            const VKEY = "0x" + "ab".repeat(32);

            /** A signal array shaped like the real circuit's twelve public inputs. */
            function signals(claim: string, name: string, customData: string) {
                const out = Array.from({ length: 12 }, (_, i) => toPaddedHex(BigInt(i)));
                // Indices here are raw (unprefixed), so one less than the declared ones.
                out[proof.getSignalIndex(label)[0] - 1] = claim;
                out[proof.getSignalIndex("name")[0] - 1] = name;
                out[proof.getSignalIndex("custom_data")[0] - 1] = customData;
                return out;
            }

            const CLAIM = toPaddedHex(BigInt("0xa9e"));
            const NAME = toPaddedHex(BigInt("0x4a3e"));
            const CUSTOM = toPaddedHex(BigInt("0xc05704a"));
            const commitments = { leaves: [CLAIM, NAME], custom_data: [CUSTOM] };

            it("marshals four proofs and prefixes the routing signal", async () => {
                const result = await make(proofLibrary).produce_proofs(
                    REVEAL, commitments, "0xdead", signals(CLAIM, NAME, CUSTOM), VKEY);

                assert.equal(result.proofs.length, 4);
                assert.equal(result.public_inputs.length, 4);
                // Bound data first, verified from public signals alone.
                assert.equal(result.proofs[0], "0x");
                assert.equal(result.public_inputs[0][0], CUSTOM);
                // The passport proof last, with the routing signal prefixed.
                assert.equal(result.public_inputs[3].length, 13);
                assert.equal(result.public_inputs[3][0], VKEY);
            });

            it("proves membership against the same root the sealer committed to", async () => {
                const result = await make(proofLibrary).produce_proofs(
                    REVEAL, commitments, "0xdead", signals(CLAIM, NAME, CUSTOM), VKEY);
                const sealerRoot = createKeccakMerkelTreeSync(8, commitments.leaves).root;
                assert.equal(result.public_inputs[1][0], sealerRoot, `${label} membership root`);
                assert.equal(result.public_inputs[2][0], sealerRoot, "name membership root");
            });

            it("rejects a proof not bound to this seal", async () => {
                const other = toPaddedHex(BigInt("0xdecafbad"));
                try {
                    await make(proofLibrary).produce_proofs(
                        REVEAL, commitments, "0xdead", signals(CLAIM, NAME, other), VKEY);
                    assert.fail("expected a rejection");
                } catch (e: any) {
                    assert.match(e.message, /not bound to this seal/);
                }
            });

            it("rejects a passport that discloses something outside the committed set", async () => {
                const other = toPaddedHex(BigInt("0xfeed"));
                try {
                    await make(proofLibrary).produce_proofs(
                        REVEAL, commitments, "0xdead", signals(other, NAME, CUSTOM), VKEY);
                    assert.fail("expected a rejection");
                } catch (e: any) {
                    assert.match(e.message, new RegExp(`disclosed ${label} or name is not in`));
                }
            });
        });
    }

    it("reads the claim from the same slot, so a swapped commitment set is rejected", async () => {
        // The modules differ only in what slot 6 means. Feeding one module a set built for the
        // other has to fail rather than quietly prove the wrong thing.
        const proofLibrary = new StandardProofLibrary();
        const NAME = toPaddedHex(BigInt("0x4a3e"));
        const CUSTOM = toPaddedHex(BigInt("0xc05704a"));
        const AGE_CLAIM = toPaddedHex(BigInt("0xa9e"));
        const BIRTH_CLAIM = toPaddedHex(BigInt("0xb127"));

        const signals = (claim: string) => {
            const out = Array.from({ length: 12 }, (_, i) => toPaddedHex(BigInt(i)));
            out[ZKPassportBirthdateProof.getSignalIndex("birthdate")[0] - 1] = claim;
            out[ZKPassportBirthdateProof.getSignalIndex("name")[0] - 1] = NAME;
            out[ZKPassportBirthdateProof.getSignalIndex("custom_data")[0] - 1] = CUSTOM;
            return out;
        };

        // An age-shaped commitment set does not contain the birthdate commitment.
        const ageCommitments = { leaves: [AGE_CLAIM, NAME], custom_data: [CUSTOM] };
        try {
            await new ZKPassportBirthdateModule(proofLibrary).produce_proofs(
                "0x" + "11".repeat(32), ageCommitments, "0xdead", signals(BIRTH_CLAIM), "0x" + "ab".repeat(32));
            assert.fail("expected a rejection");
        } catch (e: any) {
            assert.match(e.message, /not in the committed signal set/);
        }
    });
});
