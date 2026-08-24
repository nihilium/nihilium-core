import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import { EVMDataStreamDualMerkleNonZK } from "../src/lib/data_stream/EVMDataStreamDualMerkleNonZK";
import { GlobalLeafEntry, IDataStreamPersistence } from "../src/lib/persistence/types";
import { createKeccakMerkelTreeSync, keccakTreeHasher, toPaddedHex } from "../src/lib/utils";
import { Signer } from "ethers";

/**
 * Which publication of a value a proof is built from. A value can be posted to the stream any number
 * of times — by its owner or by anyone else — so the choice has to be explicit: the default is the
 * earliest publication (nobody can move an existing proof forward by re-posting), and `from` selects
 * the earliest publication anchored at or after a given time.
 *
 * Chain-free: the anchoring rounds and the leaf index are faked, since the selection rule reads only
 * the persisted round data.
 */
describe("EVMDataStreamDualMerkleNonZK occurrence selection", () => {

    const VALUE = "0x11";
    const OTHER = "0x12";

    /** Rounds in publication order; entry i is round i, matching global_value.txt. */
    const entries: GlobalLeafEntry[] = [
        { root: "0xaa", timestamp: 1000, blockHash: "0x01" },
        { root: "0xbb", timestamp: 2000, blockHash: "0x02" },
        { root: "0xcc", timestamp: 3000, blockHash: "0x03" },
    ];

    /**
     * VALUE is published in rounds 0 and 2; OTHER only in round 1. Round 3 exists as an occurrence but
     * is not anchored yet, so it must never be selected.
     */
    function fakePersistence(anchoredRounds: number): IDataStreamPersistence {
        const occurrences: { [leaf: string]: [number, number][] } = {
            [keccakTreeHasher(BigInt(VALUE), 0n)]: [[0, 0], [2, 1], [3, 0]],
            [keccakTreeHasher(BigInt(OTHER), 0n)]: [[1, 0]],
        };
        return {
            getIndexedLocalLeaf: async (leaf: string) => occurrences[leaf] ?? [],
            // Each round is a real (tiny) tree; only which round it is matters for selection.
            getLocalTree: async (globalTreeIndex: number) =>
                localTreeOf(entries[globalTreeIndex]?.root ?? "0x0"),
            getGlobalLeafEntries: async () => entries.slice(0, anchoredRounds),
        } as unknown as IDataStreamPersistence;
    }

    /** A round's local tree, rooted so that its root is the entry's root (whatever the leaves are). */
    function localTreeOf(root: string) {
        const tree = createKeccakMerkelTreeSync(4, [toPaddedHex(BigInt(root)), toPaddedHex(2n)]);
        // getProof reads .root when rebuilding the global leaf hash, so pin it to the anchored value.
        Object.defineProperty(tree, "root", { get: () => root });
        return tree;
    }

    /** The value-tree leaf a round contributes: keccak(subtreeRoot, keccak(timestamp, blockHash)). */
    function globalLeafOf(entry: GlobalLeafEntry): string {
        return keccakTreeHasher(
            BigInt(entry.root), keccakTreeHasher(BigInt(entry.timestamp), BigInt(entry.blockHash)));
    }

    /**
     * The constructor only stores its arguments (the contract wrapper stays inert until attach()), so
     * the round state can be injected directly and no chain is needed.
     */
    function streamWith(anchoredRounds: number): EVMDataStreamDualMerkleNonZK {
        const anchored = entries.slice(0, anchoredRounds);
        const stream = new EVMDataStreamDualMerkleNonZK(
            "test-stream", fakePersistence(anchoredRounds), "0xtree", {} as unknown as Signer,
        );
        (stream as any).globalLeafEntries = anchored;
        // getGlobalTreeIndex() is this tree's length, i.e. the number of anchored rounds.
        (stream as any).globalValueTree = createKeccakMerkelTreeSync(4, anchored.map(globalLeafOf));
        // Dual leaf i is the value-tree root after round i; distinct per round is all this test needs.
        (stream as any).globalDualTree = createKeccakMerkelTreeSync(
            4, anchored.map((_, i) => toPaddedHex(BigInt(100 + i))));
        return stream;
    }

    it("defaults to the earliest publication", async () => {
        const stream = streamWith(3);
        expect(await stream.isProvable(VALUE)).to.equal(true);
        expect((await stream.getProof(VALUE)).timestamp).to.equal("1000");
        expect((await stream.getProof(VALUE)).globalIndex).to.equal(0);
    });

    it("selects the earliest publication at or after `from`", async () => {
        const stream = streamWith(3);
        // Between the two publications: the later one is the only match.
        expect((await stream.getProof(VALUE, 1001)).timestamp).to.equal("3000");
        expect((await stream.getProof(VALUE, 1001)).globalIndex).to.equal(2);
        // Exactly on a round is inclusive.
        expect((await stream.getProof(VALUE, 3000)).timestamp).to.equal("3000");
    });

    it("reports a value with no publication at or after `from` as not provable", async () => {
        const stream = streamWith(3);
        expect(await stream.isProvable(VALUE, 3001)).to.equal(false);
        await expect(stream.getProof(VALUE, 3001)).to.be.rejectedWith(/anchored at or after 3001/);
    });

    it("ignores publications in rounds that are not anchored yet", async () => {
        // Only rounds 0 and 1 are anchored, so the round-2 publication is invisible.
        const stream = streamWith(2);
        expect(await stream.isProvable(VALUE, 1001)).to.equal(false);
        expect((await stream.getProof(VALUE)).timestamp).to.equal("1000");
    });

    /**
     * A resync truncates and rebuilds global_value.txt, so the positional round view can be empty while
     * the value tree still has elements. Selection must not start reporting anchored values as
     * unprovable in that window — that is a regression against the pre-`from` behaviour.
     */
    it("still selects a round whose positional entry is missing", async () => {
        const stream = streamWith(3);
        (stream as any).globalLeafEntries = [];
        (stream as any).persistence.getGlobalLeafEntries = async () => [];
        // The root-keyed view is what the stream used to resolve timestamps from.
        (stream as any).globalLeafTimestamps = new Map([[toPaddedHex(BigInt(entries[0].root)), 1000]]);
        (stream as any).globalLeafBlockHashes = new Map([[toPaddedHex(BigInt(entries[0].root)), "0x01"]]);

        expect(await stream.isProvable(VALUE)).to.equal(true);
        expect((await stream.getProof(VALUE)).timestamp).to.equal("1000");
    });

    it("recovers the positional entry by reloading it from persistence", async () => {
        const stream = streamWith(3);
        // Cache emptied (as a resync would), but the file now has the rounds again.
        (stream as any).globalLeafEntries = [];
        expect(await stream.isProvable(VALUE, 1001)).to.equal(true);
        expect((await stream.getProof(VALUE, 1001)).timestamp).to.equal("3000");
    });

    it("will not claim an unknown anchoring time satisfies a lower bound", async () => {
        const stream = streamWith(3);
        (stream as any).globalLeafEntries = [];
        (stream as any).persistence.getGlobalLeafEntries = async () => [];
        (stream as any).globalLeafTimestamps = new Map();

        // Unfiltered still resolves (with the historical 0 placeholder), filtered must not.
        expect(await stream.isProvable(VALUE)).to.equal(true);
        expect(await stream.isProvable(VALUE, 1)).to.equal(false);
    });

    it("reports an unpublished value as not provable", async () => {
        const stream = streamWith(3);
        expect(await stream.isProvable("0x99")).to.equal(false);
        await expect(stream.getProof("0x99")).to.be.rejectedWith(/Not provable/);
    });
});
