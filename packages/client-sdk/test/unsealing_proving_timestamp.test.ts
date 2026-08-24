import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import * as nhsdk from "@nihilium/core";

/**
 * "Now" from a proving perspective. Every timestamp a module writes into a public signal has to be the
 * one the opening proof anchors at, so the client resolves a single value for all k processors — and
 * re-batches the reveal values when they were anchored in different rounds.
 *
 * ZK-free: a fake data stream stands in for the anchoring rounds.
 */
describe("NihiliumUnsealingClient proving timestamp", () => {

    /**
     * Rounds are (timestamp -> values anchored then). `postData` appends a new round, which is how a
     * re-batch lands all values on one timestamp. `from` selects the earliest round at or after it,
     * mirroring EVMDataStreamDualMerkleNonZK.
     */
    function fakeDataStream(rounds: { timestamp: number; values: string[] }[]) {
        const posts: string[][] = [];
        const stream = {
            getAddress: () => "0xdatastream",
            getUrl: () => "fake://datastream",
            initialize: async () => { /* noop */ },
            hasDataStreamRoot: async () => true,
            postData: async (data: string[]) => {
                posts.push(data);
                // Anchored one second after the latest round, as a real publication round would be.
                rounds.push({ timestamp: rounds[rounds.length - 1].timestamp + 1, values: [...data] });
                return [rounds.length - 1, 0, "0xsig"] as [number, number, string];
            },
            getLatestGlobalLeafProof: async () => ({
                timestamp: rounds[rounds.length - 1].timestamp.toString(),
            }),
            isProvable: async (value: string, from: number = 0) =>
                rounds.some((r) => r.timestamp >= from && r.values.includes(value)),
            getProof: async (value: string, from: number = 0) => {
                const round = rounds.find((r) => r.timestamp >= from && r.values.includes(value));
                if (!round) throw new Error(`Not provable: ${value} at or after ${from}`);
                return { timestamp: round.timestamp.toString() };
            },
        };
        return { posts, rounds, stream: stream as unknown as nhsdk.IDualDataStream };
    }

    function sealOf(revealValues: string[]): nhsdk.types.NihiliumSeal {
        return {
            packages: revealValues.map((reveal_value) => ({ public_package: { reveal_value } })),
            fdt_seal: { threshold: revealValues.length },
        } as unknown as nhsdk.types.NihiliumSeal;
    }

    class TestClient extends nhsdk.DefaultUnsealingClient {
        seedState(processorIndices: number[]) {
            (this as any).storage_key = "test_unsealing_key";
            (this as any).state = {
                version: 1,
                status: nhsdk.NihiliumUnsealingStatus.Ready_to_unseal,
                processor_indices: processorIndices,
                reveal_published: true,
                data_stream_id: "0xdatastream",
                per_processor: processorIndices.map((i) => ({
                    processor_index: i, phase: nhsdk.ProcessorUnsealPhase.Pending,
                })),
            };
        }
        unsealState() { return (this as any).state; }
    }

    function clientFor(revealValues: string[], stream: nhsdk.IDualDataStream) {
        const client = new TestClient(sealOf(revealValues), [], [stream]);
        client.set_state_store(new nhsdk.InMemoryUnsealingStateStore());
        client.seedState(revealValues.map((_, i) => i));
        return client;
    }

    it("returns the shared timestamp when the reveal values are anchored in one round", async () => {
        const ds = fakeDataStream([{ timestamp: 1000, values: ["17", "18"] }]);
        const client = clientFor(["0x11", "0x12"], ds.stream);

        expect(await client.waitForProvingTimestamp()).to.equal(1000);
        expect(ds.posts.length).to.equal(0);          // nothing to fix, so nothing published
        expect(client.unsealState().republished).to.be.undefined;
    });

    it("re-batches once when the reveal values are anchored in different rounds", async () => {
        const ds = fakeDataStream([
            { timestamp: 1000, values: ["17"] },
            { timestamp: 2000, values: ["18"] },
        ]);
        const client = clientFor(["0x11", "0x12"], ds.stream);

        const timestamp = await client.waitForProvingTimestamp();

        expect(ds.posts.length).to.equal(1);                       // exactly one re-batch
        expect(ds.posts[0]).to.deep.equal(["17", "18"]);           // both values, one round
        expect(timestamp).to.equal(2001);                          // the round they now share
        // The watermark excludes the old rounds, so proofs are built from the new one.
        expect(client.unsealState().from_timestamp).to.equal(2001);
        expect(client.unsealState().republished).to.equal(true);
    });

    it("resolves once and reuses the persisted timestamp", async () => {
        const ds = fakeDataStream([{ timestamp: 1000, values: ["17", "18"] }]);
        const client = clientFor(["0x11", "0x12"], ds.stream);

        expect(await client.waitForProvingTimestamp()).to.equal(1000);
        // A later round containing the same values must not move an already-resolved "now".
        ds.rounds.push({ timestamp: 5000, values: ["17", "18"] });
        expect(await client.waitForProvingTimestamp()).to.equal(1000);
    });

    it("throws when a re-batch still leaves the values split", async () => {
        // postData that anchors each value in its own round — the split survives the re-batch.
        const ds = fakeDataStream([
            { timestamp: 1000, values: ["17"] },
            { timestamp: 2000, values: ["18"] },
        ]);
        (ds.stream as any).postData = async (data: string[]) => {
            data.forEach((value, i) => ds.rounds.push({ timestamp: 3000 + i, values: [value] }));
            return [ds.rounds.length - 1, 0, "0xsig"] as [number, number, string];
        };
        const client = clientFor(["0x11", "0x12"], ds.stream);

        await expect(client.waitForProvingTimestamp()).to.be.rejectedWith(/different timestamps/);
    });
});
