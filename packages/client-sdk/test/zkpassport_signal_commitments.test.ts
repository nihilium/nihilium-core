import { assert } from "chai";
import { ethers } from "ethers";
import {
    getSignalLeaves, getCommitments, getMerkleCommitment, generateSignalCommitments,
    verifySignalCommitments, hashSignalCommitmentRequest, findBirthdateMatches, findAgeMatches,
    atLeastAge, SIGNAL_TREE_DEPTH,
} from "../src/zkpassport";
import type { SignalCommitmentRequest } from "../src/zkpassport";

// @zkpassport/utils is ESM-only; this suite runs under ts-node in CJS, where a static import of it
// fails at require time. The SDK source reaches it through the bundler, so only the tests need the
// dynamic form -- the same shape this file already uses for @nihilium/core.
const zkpUtils = () => import("@zkpassport/utils");

const BIRTHDATE: SignalCommitmentRequest = {
    birthdate: { min: new Date("1970-01-01T00:00:00Z"), max: new Date("2008-01-01T00:00:00Z") },
    firstname: "Olaf", lastname: "van Wijk",
};

const REQUEST: SignalCommitmentRequest = {
    age: { min: 37, max: 38 }, firstname: "Olaf", lastname: "van Wijk",
};

describe("zkpassport signal commitments", () => {

    it("derives candidates for every requested claim", async () => {
        const commitments = await generateSignalCommitments(REQUEST);
        assert.isAbove(Object.values(commitments.age ?? {}).flat().length, 0);
        assert.isAbove(Object.values(commitments.firstname ?? {}).flat().length, 0);
    });

    it("orders the leaves deterministically", async () => {
        // Core rebuilds the tree from this array at unseal time, so a reordering between calls
        // would silently break every seal.
        const a = getSignalLeaves(await generateSignalCommitments(REQUEST));
        const b = getSignalLeaves(await generateSignalCommitments(REQUEST));
        assert.deepEqual(a, b);
        assert.isAbove(a.length, 0);
    });

    it("builds the same root core will rebuild from the leaves", async () => {
        const commitments = await generateSignalCommitments(REQUEST);
        const fromHelper = getMerkleCommitment(commitments).root;

        const nhsdk = await import("@nihilium/core");
        const fromLeaves = nhsdk.utils
            .createKeccakMerkelTreeSync(SIGNAL_TREE_DEPTH, getSignalLeaves(commitments)).root;

        assert.equal(fromHelper, fromLeaves);
    });

    it("packages the commitment material core takes as an input", async () => {
        const request = { ...REQUEST, customData: "0x" + "11".repeat(32) };
        const commitments = await generateSignalCommitments(request);
        const packaged = getCommitments(commitments);

        assert.deepEqual(packaged.leaves, getSignalLeaves(commitments));
        assert.isArray(packaged.custom_data);
        assert.isAbove(packaged.custom_data.length, 0, "bound data must yield a candidate");
    });

    it("accepts a matching proof and rejects a mismatched one", async () => {
        const commitments = await generateSignalCommitments(REQUEST);
        // A realistic 12-input array with the committed values in the circuit's slots.
        const signals = Array.from({ length: 12 }, (_, i) => "0x" + String(i).padStart(64, "0"));
        signals[5] = Object.values(commitments.age!)[0][0];
        signals[6] = Object.values(commitments.firstname!)[0][0];

        assert.isTrue(verifySignalCommitments(commitments, signals));
        assert.isFalse(verifySignalCommitments(
            commitments, Array.from({ length: 12 }, () => "0x" + "ff".repeat(32))));
    });

    describe("birthdate", () => {

        it("derives exactly one commitment -- the sealer knows the range", async () => {
            const commitments = await generateSignalCommitments(BIRTHDATE);
            const values = Object.values(commitments.birthdate ?? {}).flat();
            assert.equal(values.length, 1, "no candidate search is needed for a known range");
            assert.isUndefined(commitments.age);
        });

        it("uses ProofType.BIRTHDATE, not the value the old hand-copied table had", async () => {
            // The table here used to say BIRTHDATE = 6, which is really ISSUING_COUNTRY_INCLUSION.
            const { ProofType, getDateEVMParameterCommitment } = await zkpUtils();
            assert.equal(ProofType.BIRTHDATE, 2);
            const min = Math.floor(BIRTHDATE.birthdate!.min.getTime() / 1000);
            const max = Math.floor(BIRTHDATE.birthdate!.max.getTime() / 1000);

            const right = await getDateEVMParameterCommitment(ProofType.BIRTHDATE, min, max);
            const wrong = await getDateEVMParameterCommitment(6 as any, min, max);
            assert.notEqual(right.toString(), wrong.toString());

            const produced = (await findBirthdateMatches(BIRTHDATE.birthdate!))[0];
            assert.equal(produced, ethers.zeroPadValue(ethers.toBeHex(right), 32));
        });

        it("rejects an inverted range", async () => {
            const inverted = { min: new Date("2008-01-01Z"), max: new Date("1970-01-01Z") };
            try {
                await findBirthdateMatches(inverted);
                assert.fail("expected a rejection");
            } catch (e: any) {
                assert.match(e.message, /inverted/);
            }
        });

        it("refuses a request carrying both age and birthdate", async () => {
            // They occupy the same parameter-commitment slot, so one would be silently dropped.
            try {
                await generateSignalCommitments({ ...BIRTHDATE, age: 37 });
                assert.fail("expected a rejection");
            } catch (e: any) {
                assert.match(e.message, /age or birthdate, not both/);
            }
        });

        it("orders leaves the same shape as age, claim first then name", async () => {
            const ageLeaves = getSignalLeaves(await generateSignalCommitments(REQUEST));
            const birthLeaves = getSignalLeaves(await generateSignalCommitments(BIRTHDATE));

            // Same name candidates in both, and the claim leads in each. Both claims commit one
            // leaf now -- the sealer states the range, so neither has anything to guess.
            assert.equal(ageLeaves.length, birthLeaves.length, "both claims commit exactly one leaf");
            assert.notDeepEqual(ageLeaves, birthLeaves, "different claims must give different roots");
            assert.equal(
                birthLeaves[0],
                Object.values((await generateSignalCommitments(BIRTHDATE)).birthdate!).flat()[0]);
        });

        it("builds a root core can rebuild from the leaves", async () => {
            const commitments = await generateSignalCommitments(BIRTHDATE);
            const nhsdk = await import("@nihilium/core");
            assert.equal(
                getMerkleCommitment(commitments).root,
                nhsdk.utils.createKeccakMerkelTreeSync(SIGNAL_TREE_DEPTH, getSignalLeaves(commitments)).root);
        });

        it("verifies a matching proof and rejects a mismatched one", async () => {
            const commitments = await generateSignalCommitments(BIRTHDATE);
            const signals = Array.from({ length: 12 }, (_, i) => "0x" + String(i).padStart(64, "0"));
            signals[5] = Object.values(commitments.birthdate!)[0][0];
            signals[6] = Object.values(commitments.firstname!)[0][0];

            assert.isTrue(verifySignalCommitments(commitments, signals));
            assert.isFalse(verifySignalCommitments(
                commitments, Array.from({ length: 12 }, () => "0x" + "ff".repeat(32))));
        });
    });

    it("commits exactly the range the sealer stated, and nothing else", async () => {
        // The age path used to fan out to three candidates, any one of which opened the seal.
        // It now commits one, and it has to be ZKPassport's own commitment for that range.
        const commitments = await generateSignalCommitments(REQUEST);
        const { getAgeEVMParameterCommitment } = await zkpUtils();
        const expected = ethers.zeroPadValue(
            ethers.toBeHex(await getAgeEVMParameterCommitment(37, 38)), 32);
        assert.deepEqual(Object.values(commitments.age!).flat(), [expected]);
    });

    describe("minimum age", () => {

        it("commits only the gte leaf, so an lte proof cannot open the seal", async () => {
            // The bypass this exists to close: with (0, 19) also committed, a 15-year-old could
            // prove lte("age", 19) and open a seal meant for over-18s.
            const { getAgeEVMParameterCommitment } = await zkpUtils();
            const hex = async (min: number, max: number) => ethers.zeroPadValue(
                ethers.toBeHex(await getAgeEVMParameterCommitment(min, max)), 32);

            const leaves = await findAgeMatches(atLeastAge(18));

            assert.deepEqual(leaves, [await hex(18, 0)], "gte(18) is the only committed encoding");
            assert.notInclude(leaves, await hex(0, 18), "lte(18) must not be committed");
            assert.notInclude(leaves, await hex(0, 19), "lte(19) must not be committed");
            assert.notInclude(leaves, await hex(18, 19), "range(18, 19) must not be committed");
        });

        it("reads max 0 as no upper bound rather than an inverted range", () => {
            assert.deepEqual(atLeastAge(21), { min: 21, max: 0 });
        });

        it("rejects an inverted range", async () => {
            try {
                await findAgeMatches({ min: 30, max: 20 });
                assert.fail("expected a rejection");
            } catch (e: any) {
                assert.match(e.message, /inverted/);
            }
        });

        it("rejects an age outside the byte the commitment payload has for it", async () => {
            for (const range of [{ min: 300, max: 0 }, { min: 18, max: 999 }, { min: 1.5, max: 0 }]) {
                try {
                    await findAgeMatches(range);
                    assert.fail(`expected a rejection for ${JSON.stringify(range)}`);
                } catch (e: any) {
                    assert.match(e.message, /integer in 0\.\.255/);
                }
            }
        });
    });

    it("hashes a request stably, for cache keys", () => {
        assert.equal(hashSignalCommitmentRequest(REQUEST), hashSignalCommitmentRequest(REQUEST));
        assert.notEqual(
            hashSignalCommitmentRequest(REQUEST),
            hashSignalCommitmentRequest({ ...REQUEST, age: { min: 38, max: 39 } }));
    });
});
