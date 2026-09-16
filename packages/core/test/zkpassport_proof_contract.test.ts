import { assert, expect } from "chai";
import { ethers } from "hardhat";

/** "0.16.0" packed as 3 x uint16 BE, right-padded to bytes32 -- ZKPassport's version encoding. */
function versionKey(v: string): string {
    const parts = v.split(".").map(Number);
    return "0x" + parts.map((n) => n.toString(16).padStart(4, "0")).join("").padEnd(64, "0");
}

const V_0_16_0 = versionKey("0.16.0");
const VKEY = ethers.keccak256(ethers.toUtf8Bytes("some-circuit-vkey"));

/** [0] routing vkeyHash, then the circuit's twelve inputs; its index 2 is currentDate. */
function publicInputs(currentDate: number): string[] {
    const inputs = Array.from({ length: 13 }, () => ethers.ZeroHash);
    inputs[0] = VKEY;
    inputs[3] = ethers.zeroPadValue(ethers.toBeHex(currentDate), 32);
    return inputs;
}

describe("ZKPassportProof", () => {
    let root: any, subVerifier: any, honk: any, proxy: any;

    beforeEach(async () => {
        root = await (await ethers.getContractFactory("TestZKPassportRoot")).deploy();
        subVerifier = await (await ethers.getContractFactory("TestZKPassportSubVerifier")).deploy();
        honk = await (await ethers.getContractFactory("TestExpectInputs")).deploy();
        await root.setSubVerifier(V_0_16_0, await subVerifier.getAddress());
        await subVerifier.setVerifier(VKEY, await honk.getAddress());
        proxy = await (await ethers.getContractFactory("ZKPassportProof")).deploy(await root.getAddress());
    });

    describe("learning", () => {
        it("copies the upstream mapping", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            assert.equal(await proxy.verifiers(VKEY), await honk.getAddress());
            assert.equal(await proxy.versionOf(VKEY), V_0_16_0);
            assert.equal(await proxy.bannedAt(VKEY), 0n);
        });

        it("is permissionless", async () => {
            const [, stranger] = await ethers.getSigners();
            await proxy.connect(stranger).learnVerifier(V_0_16_0, VKEY);
            assert.equal(await proxy.verifiers(VKEY), await honk.getAddress());
        });

        it("is add-only, so an upstream swap cannot move what we hold", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            const other = await (await ethers.getContractFactory("TestExpectInputs")).deploy();
            await subVerifier.setVerifier(VKEY, await other.getAddress());

            await expect(proxy.learnVerifier(V_0_16_0, VKEY)).to.be.revertedWith("Already learned");
            assert.equal(await proxy.verifiers(VKEY), await honk.getAddress());
        });

        it("refuses an unknown version", async () => {
            await expect(proxy.learnVerifier(versionKey("9.9.9"), VKEY))
                .to.be.revertedWith("Unknown version upstream");
        });

        it("refuses a vkeyHash the upstream does not know", async () => {
            const unknown = ethers.keccak256(ethers.toUtf8Bytes("nope"));
            await expect(proxy.learnVerifier(V_0_16_0, unknown)).to.be.revertedWith("Unknown upstream");
        });

        it("refuses an address with no code", async () => {
            const bare = ethers.keccak256(ethers.toUtf8Bytes("bare"));
            await subVerifier.setVerifier(bare, "0x000000000000000000000000000000000000dEaD");
            await expect(proxy.learnVerifier(V_0_16_0, bare)).to.be.revertedWith("Verifier has no code");
        });
    });

    describe("verifying", () => {
        it("routes to the learned verifier and strips the routing signal", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            // True only if the inner verifier saw the circuit's twelve inputs, routing removed.
            await honk.expect(12, ethers.ZeroHash);
            assert.isTrue(await proxy.verify("0xaabb", publicInputs(1_700_000_000)));

            // And false when handed the wrong shape, so the assertion above has teeth.
            await honk.expect(13, VKEY);
            assert.isFalse(await proxy.verify("0xaabb", publicInputs(1_700_000_000)));
        });

        it("returns false rather than reverting for an unlearned vkeyHash", async () => {
            assert.isFalse(await proxy.verify("0xaabb", publicInputs(1_700_000_000)));
        });

        it("returns false for a short input array", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            assert.isFalse(await proxy.verify("0xaabb", [VKEY, ethers.ZeroHash, ethers.ZeroHash]));
        });
    });

    describe("banning", () => {
        it("refuses to record a ban while the entry is still current", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            await expect(proxy.recordBan(VKEY)).to.be.revertedWith("Still current upstream");
        });

        it("keeps proofs issued before the ban working, and stops later ones", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            await subVerifier.setVerifier(VKEY, ethers.ZeroAddress); // ZKPassport retires it
            await proxy.recordBan(VKEY);

            const bannedAt = Number(await proxy.bannedAt(VKEY));
            assert.isAbove(bannedAt, 0);
            assert.isTrue(await proxy.verify("0xaabb", publicInputs(bannedAt - 1)));
            assert.isFalse(await proxy.verify("0xaabb", publicInputs(bannedAt)));
            assert.isFalse(await proxy.verify("0xaabb", publicInputs(bannedAt + 1)));
        });

        it("also treats a removed version as retirement", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            await root.setSubVerifier(V_0_16_0, ethers.ZeroAddress);
            await proxy.recordBan(VKEY);
            assert.isAbove(Number(await proxy.bannedAt(VKEY)), 0);
        });

        it("records once, so a later re-ban cannot move the cut-off", async () => {
            await proxy.learnVerifier(V_0_16_0, VKEY);
            await subVerifier.setVerifier(VKEY, ethers.ZeroAddress);
            await proxy.recordBan(VKEY);
            const first = await proxy.bannedAt(VKEY);

            await expect(proxy.recordBan(VKEY)).to.be.revertedWith("Already recorded");
            assert.equal(await proxy.bannedAt(VKEY), first);
        });

        it("requires the entry to have been learned first", async () => {
            await expect(proxy.recordBan(VKEY)).to.be.revertedWith("Not learned");
        });
    });

    it("refuses to deploy where ZKPassport does not exist", async () => {
        const factory = await ethers.getContractFactory("ZKPassportProof");
        await expect(factory.deploy("0x000000000000000000000000000000000000dEaD"))
            .to.be.revertedWith("No ZKPassport deployment on this chain");
    });
});
