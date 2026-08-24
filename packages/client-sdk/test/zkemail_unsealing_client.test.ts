import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import * as nhsdk from "@nihilium/core";
import { ZKEmailUnsealingClient } from "../src/scenarios/zkemail/zkemail_unsealing_client";

// ZK-free wiring tests for the ZKEmail scenario (relocated from @nihilium/core). A fake email service
// verifies the recovery-email exchange, the persisted scenario state, and the resolver shapes.
describe("ZKEmailUnsealingClient scenario wiring", () => {
    function fakeEmailService() {
        const calls: { url: string; method: string; body?: string }[] = [];
        const fetchFn = async (url: string, init?: any) => {
            const method = init?.method ?? "GET";
            calls.push({ url, method, body: init?.body });
            if (url.endsWith("/recovery") && method === "POST") {
                return { json: async () => ({}) };
            }
            if (/\/recovery\/.+\/proofs$/.test(url) && method === "POST") {
                return { json: async () => ({ status: "accepted" }) };
            }
            if (/\/recovery\/.+\/proofs\/.+$/.test(url)) {
                return { json: async () => ({
                    status: "finished", proof: { hex: "abcd" }, publicSignals: ["1", "2"],
                    proofType: "RSA2048", timestamp: 1_800_000_500,
                }) };
            }
            return { json: async () => ({}) };
        };
        return { calls, fetchFn };
    }

    // Minimal seal — only the fields the client reads at construction and while resolving "now".
    const seal = {
        packages: [{
            private_package: { proving_hints: { email: "user@example.com" } },
            public_package: { reveal_value: "0x11" },
        }],
        fdt_seal: { threshold: 1 },
    } as unknown as nhsdk.types.NihiliumSeal;

    const address_map = { getAddress: (key: string) => `0x${key}` };

    // Every reveal value is anchored in one round, so "now" resolves without a re-batch.
    function fakeDataStream(timestamp: number = 1_800_000_000) {
        return {
            getAddress: () => "0xdatastream",
            isProvable: async () => true,
            getProof: async () => ({ timestamp: timestamp.toString() }),
        } as unknown as nhsdk.IDualDataStream;
    }

    // Exposes the protected scenario hooks + seeds a minimal persisted state.
    class TestZKEmail extends ZKEmailUnsealingClient {
        seedState() {
            (this as any).storage_key = "test_zkemail_key";
            (this as any).state = {
                version: 1,
                status: nhsdk.NihiliumUnsealingStatus.Ready_to_unseal,
                processor_indices: [0],
                reveal_published: true,
                per_processor: [{ processor_index: 0, phase: nhsdk.ProcessorUnsealPhase.Pending }],
                scenario_state: {},
            };
        }
        prepare() { return (this as any).prepareProofProduction([0]); }
        resolvers() { return (this as any).buildResolvers(); }
        scenario() { return (this as any).getScenarioState(); }
        unsealState() { return (this as any).state; }
    }

    it("runs the recovery-email exchange and exposes hashtie/zkemail resolvers", async () => {
        const svc = fakeEmailService();
        const client = new TestZKEmail(seal, [], [fakeDataStream()], address_map, { emailServiceUrl: "https://email.test/", fetchFn: svc.fetchFn });
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState();

        await client.prepare();
        const s = client.scenario();
        expect(s.emailSubject).to.match(/^0x[0-9a-f]+$/);
        expect(s.hashTiedPreimage).to.be.a("string");
        expect(s.emailAccepted).to.equal(true);

        const postRecovery = svc.calls.filter((c) => c.url === "https://email.test/recovery" && c.method === "POST");
        expect(postRecovery.length).to.equal(1);
        expect(JSON.parse(postRecovery[0].body!).email).to.equal("user@example.com");
        expect(JSON.parse(postRecovery[0].body!).recovery_id).to.equal(s.emailSubject);

        // "now" is resolved before the email goes out, and is what the ZKEmail proof will be built against.
        expect(client.unsealState().proving_timestamp).to.equal(1_800_000_000);

        const resolvers = client.resolvers();
        expect(await resolvers.HashTieModule(undefined as any, undefined as any)).to.deep.equal({ preimage: s.hashTiedPreimage });
        const zk = await resolvers.ZKEmailModule(undefined as any, undefined as any);
        expect(zk.proof).to.equal("0xabcd");           // 0x prefix normalized
        expect(zk.publicSignals).to.deep.equal(["1", "2"]);
        // snake_case is what the module reads; camelCase silently selected the wrong RSA verifier.
        expect(zk.proof_type).to.equal("RSA2048");
        // The service's own timestamp is recorded but never used as the proof's timestamp.
        expect(client.scenario().emailServiceTimestamp).to.equal(1_800_000_500);
        expect(client.scenario().emailProofType).to.equal("RSA2048");
    });

    // The reveal values only have to be anchored by the time a module produces. Waiting for that before
    // sending the email stacks the anchoring delay on top of the (far longer) wait for a human to reply,
    // for no benefit — nothing in the email exchange depends on it.
    it("sends the recovery email before waiting for the reveal values to anchor", async () => {
        const events: string[] = [];
        const svc = fakeEmailService();
        const fetchFn = async (url: string, init?: any) => {
            if (url.endsWith("/recovery") && (init?.method ?? "GET") === "POST") events.push("email:sent");
            return svc.fetchFn(url, init);
        };
        const dataStream = {
            getAddress: () => "0xdatastream",
            isProvable: async () => { events.push("datastream:anchor-check"); return true; },
            getProof: async () => ({ timestamp: "1800000000" }),
        } as unknown as nhsdk.IDualDataStream;

        const phases: string[] = [];
        const client = new TestZKEmail(seal, [], [dataStream], address_map, {
            emailServiceUrl: "https://email.test", fetchFn, onPhase: (p) => phases.push(p),
        });
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState();

        await client.prepare();

        expect(events[0]).to.equal("email:sent");
        expect(events).to.include("datastream:anchor-check");
        expect(events.indexOf("email:sent")).to.be.lessThan(events.indexOf("datastream:anchor-check"));
        // Reordering must not lose the timestamp: it is still resolved before any proof is produced.
        expect(client.unsealState().proving_timestamp).to.equal(1_800_000_000);
        expect(phases).to.deep.equal(["preparing", "awaiting_email_reply", "unsealing"]);
    });

    it("reuses the persisted subject on a second prepare (no new recovery email)", async () => {
        const svc = fakeEmailService();
        const client = new TestZKEmail(seal, [], [fakeDataStream()], address_map, { emailServiceUrl: "https://email.test", fetchFn: svc.fetchFn });
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState();

        await client.prepare();
        const subject1 = client.scenario().emailSubject;
        await client.prepare(); // emailAccepted persisted → no second email flow

        expect(client.scenario().emailSubject).to.equal(subject1);
        const postRecovery = svc.calls.filter((c) => c.url.endsWith("/recovery") && c.method === "POST");
        expect(postRecovery.length).to.equal(1);
    });

    it("falls back to the recovery service recorded on the seal", async () => {
        const svc = fakeEmailService();
        const sealWithService = {
            ...seal,
            shared_proving_hints: { email: "user@example.com", email_service_url: "https://recorded.test" },
        } as unknown as nhsdk.types.NihiliumSeal;
        // No emailServiceUrl passed: the seal has to carry enough to recover on its own.
        const client = new TestZKEmail(sealWithService, [], [fakeDataStream()], address_map, { fetchFn: svc.fetchFn });
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState();

        await client.prepare();
        expect(svc.calls[0].url).to.equal("https://recorded.test/recovery");
    });

    it("throws when neither the caller nor the seal names a recovery service", async () => {
        const svc = fakeEmailService();
        expect(() => new TestZKEmail(seal, [], [fakeDataStream()], address_map, { fetchFn: svc.fetchFn }))
            .to.throw(/no recovery email service/);
    });

    it("throws when no recovery email is available", async () => {
        const noEmailSeal = {
            packages: [{ private_package: {}, public_package: { reveal_value: "0x11" } }],
            fdt_seal: { threshold: 1 },
        } as unknown as nhsdk.types.NihiliumSeal;
        const svc = fakeEmailService();
        const client = new TestZKEmail(noEmailSeal, [], [fakeDataStream()], address_map, { emailServiceUrl: "https://email.test", fetchFn: svc.fetchFn });
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState();
        await expect(client.prepare()).to.be.rejectedWith(/no recovery email/);
    });

    // Regression for the "Illegal invocation" bug: the DEFAULT fetch (no fetchFn injected) must call the
    // global fetch with the global `this`, not the client instance.
    it("calls the global fetch with the global `this` (no illegal invocation)", async () => {
        const original = (globalThis as any).fetch;
        const receivers: any[] = [];
        (globalThis as any).fetch = function (this: any, _url: string, _init?: any) {
            receivers.push(this);
            return Promise.resolve({ json: async () => ({ status: "accepted" }) });
        };
        try {
            // No fetchFn provided → exercises the default binding.
            const client = new TestZKEmail(seal, [], [fakeDataStream()], address_map, { emailServiceUrl: "https://email.test" });
            client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
            client.seedState();
            await client.prepare();

            expect(receivers.length).to.be.greaterThan(0);
            for (const receiver of receivers) {
                expect(receiver === globalThis || receiver === undefined).to.equal(true);
                expect(receiver).to.not.equal(client); // the bug bound `this` to the client instance
            }
        } finally {
            (globalThis as any).fetch = original;
        }
    });
});
