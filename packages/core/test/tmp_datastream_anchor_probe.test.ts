import { expect } from "chai";
import { ethers } from "hardhat";
import { EVMDataStreamDualMerkleNonZK } from "../src/lib/data_stream/EVMDataStreamDualMerkleNonZK";
import { DataStreamFilePersistence } from "../src/lib/persistence/DataStreamFilePersistence";
import { createKeccakMerkelTree } from "../src/lib/utils";
import { cryptoTools } from "@nihilium/zkp-circuits";

// TEMPORARY diagnostic: does a posted value become provable once its round is anchored?
describe("datastream anchoring probe", () => {
    it("anchors a posted value and reports it provable", async function () {
        this.timeout(180000);
        const signers = await ethers.getSigners();
        const merkleTree = await ethers.getContractFactory("EmpheralDualMerkleTreeKeccak");
        const contract = await merkleTree.deploy(signers[0], 20);
        const address = await contract.getAddress();

        const persistence = new DataStreamFilePersistence(
            "./test_data/probe_" + Date.now(), createKeccakMerkelTree);
        const stream = new EVMDataStreamDualMerkleNonZK(
            "probe", persistence, address, signers[0], 10, 20, 10);
        await stream.initialize();

        const value = cryptoTools.generateRandom248BitNumber().toString();
        await stream.postData([value]);
        await stream.postData([cryptoTools.generateRandom248BitNumber().toString()]);

        let provable = false;
        for (let i = 0; i < 240 && !provable; i++) {
            await new Promise((r) => setTimeout(r, 500));
            provable = await stream.isProvable(value);
        }

        const entries = await persistence.getGlobalLeafEntries();
        const occurrences = await (persistence as any).getIndexedLocalLeaf(
            (await import("../src/lib/utils")).keccakTreeHasher(BigInt(value), 0n));
        console.log("PROBE globalTreeIndex:", stream.getGlobalTreeIndex());
        console.log("PROBE entries:", JSON.stringify(entries));
        console.log("PROBE occurrences of value:", JSON.stringify(occurrences));
        console.log("PROBE provable:", provable);

        expect(provable).to.equal(true);
        expect((await stream.getProof(value)).timestamp).to.match(/^[0-9]+$/);
    });
});
