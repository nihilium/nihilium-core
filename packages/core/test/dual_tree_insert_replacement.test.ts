import { expect } from "chai";
import { ethers, network } from "hardhat";
import { BrowserProvider, Wallet } from "ethers";
import { EVMDataStreamDualMerkleNonZK } from "../src/lib/data_stream/EVMDataStreamDualMerkleNonZK";
import { DataStreamFilePersistence } from "../src/lib/persistence/DataStreamFilePersistence";
import { IDataStreamPersistence, OnChainPublishingState } from "../src/lib/persistence/types";
import { createKeccakMerkelTree, createKeccakMerkelTreeSync, toPaddedHex } from "../src/lib/utils";

// Hardhat's default account 0, so the wallet below signs locally for the same account the signers use.
const ACCOUNT_0_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
        await new Promise((r) => setTimeout(r, 200));
    }
}

/**
 * A transaction stuck in the mempool at the stream's next nonce used to make every insert fail with
 * "replacement transaction underpriced", and the failure handler retried by recursing into itself forever.
 */
describe("EVMDataStreamDualMerkleNonZK stuck transaction recovery", () => {

    afterEach(async () => {
        await network.provider.send("evm_setIntervalMining", [0]);
        await network.provider.send("evm_setAutomine", [true]);
    });

    it("replaces a stuck transaction at the insert nonce by outbidding it", async function () {
        this.timeout(180000);
        const signers = await ethers.getSigners();
        const contract = await (await ethers.getContractFactory("EmpheralDualMerkleTreeKeccak")).deploy(signers[0], 24);
        const address = await contract.getAddress();

        const wallet = new Wallet(ACCOUNT_0_KEY, new BrowserProvider(network.provider as any));
        const persistence = new DataStreamFilePersistence("./test_data/stuck_" + Date.now(), createKeccakMerkelTree);
        const stream = new EVMDataStreamDualMerkleNonZK("stuck", persistence, address, wallet, 1, 24, 10);
        // Speed up the escalation: re-send after 2s instead of a minute.
        (stream as any).global_evm_merkle_tree = new (await import("../src/lib/contract_wrappers/EmpheralDualMerkleTreeWrapper"))
            .EmpheralDualMerkleTreeWrapper(wallet, { waitTimeoutMs: 2000, pollIntervalMs: 200 });
        await stream.initialize();
        await stream.postData([toPaddedHex(1n)]);
        await waitFor(() => stream.getGlobalTreeIndex() >= 1, 60000);

        // Park a transaction at the next nonce that outbids the network fee, and stop mining on demand.
        await network.provider.send("evm_setAutomine", [false]);
        const feeData = await wallet.provider!.getFeeData();
        const stuck = await wallet.sendTransaction({
            to: wallet.address,
            value: 0,
            nonce: await wallet.provider!.getTransactionCount(wallet.address, "latest"),
            maxFeePerGas: feeData.maxFeePerGas! * 2n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas! * 2n,
        });

        const anchoredBefore = stream.getGlobalTreeIndex();
        await stream.postData([toPaddedHex(2n)]);
        await stream.postData([toPaddedHex(3n)]);
        // Only mine once the stream has managed to get its own transaction into the pool at that nonce,
        // which requires outbidding the parked one.
        await waitFor(() => (stream as any).global_evm_merkle_tree.pendingHashes.length > 0, 90000);
        await network.provider.send("evm_setIntervalMining", [1000]);
        await waitFor(() => stream.getGlobalTreeIndex() > anchoredBefore, 90000);

        expect(await wallet.provider!.getTransactionReceipt(stuck.hash)).to.equal(null);
        expect(await stream.isProvable(toPaddedHex(2n))).to.equal(true);
        expect(BigInt(await contract.currentIndex())).to.equal(BigInt(stream.getGlobalTreeIndex() - 1));
    });

    it("retries a failed insert with backoff instead of recursing", async () => {
        let state: OnChainPublishingState = { processing_local_tree: -1, local_trees_to_process: [0] };
        const persistence = {
            getLocalTree: async () => createKeccakMerkelTreeSync(20, [toPaddedHex(7n)]),
            getOnChainPublishingState: async () => state,
            setOnChainPublishingState: async (s: OnChainPublishingState) => { state = s; },
            storeGlobalValueTreeLeaf: async () => {},
            storeGlobalDualTreeLeaf: async () => {},
        } as unknown as IDataStreamPersistence;
        const stream: any = new EVMDataStreamDualMerkleNonZK("retry", persistence, "0x0", {} as any, 10, 20);
        stream.on_chain_publishing_state = state;
        stream.globalValueTree = createKeccakMerkelTreeSync(20, [toPaddedHex(5n)]);
        stream.globalDualTree = createKeccakMerkelTreeSync(20, [toPaddedHex(6n)]);

        let resyncs = 0;
        stream.load_everything = async () => {};
        stream.resyncGlobalTree = async () => { resyncs++; };
        let inserts = 0;
        stream.global_evm_merkle_tree = {
            insert: async () => {
                inserts++;
                if (inserts <= 2) throw Object.assign(new Error("replacement fee too low"), { code: "REPLACEMENT_UNDERPRICED" });
                return { index: 1, timestamp: 1000, blockHash: "0x01", newValueRoot: 1n, newDualRoot: 1n };
            },
        };

        await stream.processGlobalTreeInsert();
        expect(inserts).to.equal(1);
        expect(resyncs).to.equal(1);

        // Still backing off: the interval tick does nothing.
        await stream.processGlobalTreeInsert();
        expect(inserts).to.equal(1);

        stream.nextInsertAttemptAt = 0;
        await stream.processGlobalTreeInsert();
        expect(inserts).to.equal(2);
        expect(stream.nextInsertAttemptAt).to.be.greaterThan(Date.now() + 3000); // backoff doubled

        stream.nextInsertAttemptAt = 0;
        const anchoredBefore = stream.getGlobalTreeIndex();
        await stream.processGlobalTreeInsert();
        expect(inserts).to.equal(3);
        expect(state.local_trees_to_process).to.deep.equal([]);
        expect(state.processing_local_tree).to.equal(-1);
        expect(stream.getGlobalTreeIndex()).to.equal(anchoredBefore + 1);
    });
});
