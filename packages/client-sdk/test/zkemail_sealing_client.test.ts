import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import * as nhsdk from "@nihilium/core";
import { ZKEmailSealingClient } from "../src/scenarios/zkemail/zkemail_sealing_client";
import { hashEmailAddress } from "../src/scenarios/zkemail/email_hash";

// ZK-free wiring tests for the ZKEmail seal scenario: the collection it compiles from
// zk-email-full.json, the email hash it feeds that collection, and the hints it puts on the seal.
describe("ZKEmailSealingClient wiring", () => {

    const NETWORK = nhsdk.NETWORK_IDS.SEPOLIA;

    describe("hashEmailAddress", () => {
        it("is deterministic and returns a padded field element", () => {
            const hash = hashEmailAddress("user@example.com");
            expect(hash).to.match(/^0x[0-9a-f]{64}$/);
            expect(hashEmailAddress("user@example.com")).to.equal(hash);
        });

        it("distinguishes addresses, including case and near-misses", () => {
            const base = hashEmailAddress("user@example.com");
            expect(hashEmailAddress("User@example.com")).to.not.equal(base);
            expect(hashEmailAddress("user@example.co")).to.not.equal(base);
            expect(hashEmailAddress("")).to.not.equal(base);
        });

        it("packs 31 bytes per limb — a 32nd byte must land in the next limb", () => {
            // If the packing width were wrong, these two would collide or wrap incorrectly.
            const a = hashEmailAddress("a".repeat(31));
            const b = hashEmailAddress("a".repeat(32));
            expect(a).to.not.equal(b);
        });

        it("rejects an address longer than the circuit can pack", () => {
            // Silently truncating would produce a hash the circuit never reproduces, and the failure
            // would only surface much later as a proof that will not verify.
            expect(() => hashEmailAddress("a".repeat(250) + "@example.com")).to.throw(/at most 256/);
        });
    });

    describe("buildTemplate", () => {
        it("compiles the [opening -> HashTie -> ZKEmail] collection from the JSON", () => {
            const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
            const moduleNames = template.compiled_collection.compiled_modules[0].map((m: any) => m.module_name);
            expect(moduleNames).to.deep.equal(["UnsealOpeningModule", "HashTieModule", "ZKEmailModule"]);
        });

        it("registers the datastream the opening proof is validated against", () => {
            // The editor export carries no data stream; without one the compiled template declares no
            // datastream input and unsealing later dereferences a stream that was never mapped.
            const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
            const declared = (template.data_streams ?? []).flat().map((d: any) => d.datastream_id);
            expect(declared).to.deep.equal(["datastream"]);
        });

        it("requires the email hash as the only user input the caller must supply", () => {
            const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
            // metadata_root_hash is the other user input, but the single-share sealing process fills it
            // in from the metadata root; the email hash is the one the scenario has to provide.
            expect(template.getExpectedInputs()).to.have.members([
                "UnsealOpeningModule_0:metadata_root_hash",
                "ZKEmailModule_2:email_address_hash",
            ]);
        });

        it("compiles with the email hash and the datastream mapped", () => {
            const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
            // The key the sealing client uses must be the key the template asks for.
            const address = "0x00000000000000000000000000000000000000ff";
            expect(() => template.compile(
                { "ZKEmailModule_2:email_address_hash": BigInt(hashEmailAddress("user@example.com")),
                  "UnsealOpeningModule_0:metadata_root_hash": 1234n },
                { datastream: address },
            )).to.not.throw();
            expect(template.isCompiled()).to.equal(true);
            // Compiling emits the data-root validation, which is what the unseal path needs to exist.
            expect(template.getAllDataStreams()).to.deep.equal([address]);
        });
    });

    describe("proving hints", () => {
        // Exposes the protected hooks the base client calls while assembling the seal.
        class TestSealing extends ZKEmailSealingClient {
            static build(
                email: string, encrypted_value?: any, emailServiceUrl?: string, dsAddress: string = "0xds",
            ) {
                const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
                const client = new (TestSealing as any)(
                    [{ server_address: "0x1" }], [{ getAddress: () => dsAddress }], template,
                    { email, threshold: 1, network: NETWORK, emailServiceUrl },
                ) as TestSealing;
                (client as any).state = { scenario_state: encrypted_value ? { encrypted_value } : {} };
                return client;
            }
            hints() { return (this as any).buildProvingHints(); }
            sharedHints() { return (this as any).buildSharedProvingHints(); }
        }

        it("puts the recovery email on each package so an unseal can find it", () => {
            expect(TestSealing.build("user@example.com").hints()).to.deep.equal({ email: "user@example.com" });
        });

        it("puts the email and the vault-encrypted value on the seal", () => {
            const blob = { alg: "ECIES-BJJ-AES256GCM", R: { x: "0x1", y: "0x2" }, iv: "0x3", ciphertext: "0x4" };
            expect(TestSealing.build("user@example.com", blob).sharedHints())
                .to.deep.equal({ email: "user@example.com", encrypted_value: blob, email_service_url: undefined });
        });

        it("refuses to seal against an uninitialized data stream", async () => {
            // A DataStreamClient only learns its address in initialize(). Sealing without that compiles
            // an empty data-root address, which surfaces far away as "invalid address" from the
            // chained-proof verifier — so fail here, where the cause is obvious.
            await expect(TestSealing.build("user@example.com", undefined, undefined, "").seal("secret"))
                .to.be.rejectedWith(/Data stream has no address/);
        });

        it("records the recovery service on the seal, without a trailing slash", () => {
            // Recording it is what lets an unseal work from the .nh file alone.
            const hints = TestSealing.build("user@example.com", undefined, "https://zkemail.test/").sharedHints();
            expect(hints.email_service_url).to.equal("https://zkemail.test");
        });
    });

    // Sealing is k multi-second ZK proofs; the scenario forwards the core's events so a caller can show
    // something for that time, and derives the human-readable line from the same events rather than
    // narrating separately (which is how the two drift apart).
    describe("progress forwarding", () => {
        function clientWith(opts: { onProgress?: (m: string) => void; onSealProgress?: (e: any) => void }) {
            const template = ZKEmailSealingClient.buildTemplate({ network: NETWORK });
            return new (ZKEmailSealingClient as any)(
                [{ server_address: "0x1" }, { server_address: "0x2" }, { server_address: "0x3" }],
                [{ getAddress: () => "0xds" }], template,
                { email: "user@example.com", threshold: 2, network: NETWORK, ...opts },
            ) as ZKEmailSealingClient;
        }

        it("forwards the structured event untouched", () => {
            const events: any[] = [];
            const client = clientWith({ onSealProgress: (e) => events.push(e) });
            (client as any).state = { per_processor: [] };

            (client as any).emitProgress(nhsdk.SealProgressStage.ProvingShare, { processor_index: 1 });

            expect(events.length).to.equal(1);
            expect(events[0].stage).to.equal(nhsdk.SealProgressStage.ProvingShare);
            expect(events[0].processor_index).to.equal(1);
            expect(events[0].processor_count).to.equal(3);
            expect(events[0].total).to.equal(8);
        });

        it("describes shares 1-based, so the first proof is 'share 1 of 3'", () => {
            const messages: string[] = [];
            const client = clientWith({ onProgress: (m) => messages.push(m) });
            (client as any).state = { per_processor: [] };

            (client as any).emitProgress(nhsdk.SealProgressStage.RequestingCommitment, { processor_index: 0 });
            (client as any).emitProgress(nhsdk.SealProgressStage.ProvingShare, { processor_index: 0 });
            (client as any).emitProgress(nhsdk.SealProgressStage.ThresholdExpansion, { combinations: 3 });

            expect(messages).to.deep.equal([
                "Requesting commitment for share 1 of 3...",
                "Proving share 1 of 3...",
                "Building threshold paths (3 combinations)...",
            ]);
        });

        it("says nothing for stages the caller reports itself", () => {
            const messages: string[] = [];
            const client = clientWith({ onProgress: (m) => messages.push(m) });
            (client as any).state = { per_processor: [] };

            (client as any).emitProgress(nhsdk.SealProgressStage.ShareSealed, { processor_index: 0 });
            (client as any).emitProgress(nhsdk.SealProgressStage.Sealed);

            expect(messages).to.deep.equal([]);
        });
    });
});
