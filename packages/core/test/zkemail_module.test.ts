import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import { ZKEmailModule } from "../src/lib/unseal_conditions/modules/standard_modules/ZKEmail";
import { StandardProofLibrary } from "../src/lib/unseal_conditions/proofs";
import { BasicAddressMap } from "../src/lib/unseal_conditions/collections/types";
import { ProofProductionContext } from "../src/lib/unseal_conditions/modules/types";

/**
 * The public signals ZKEmailProof.sol reads: [0] the timestamp it checks the DKIM key against, [1] the
 * RSA verifier the proxy dispatches to, [2:] the signals the circuit actually proved. The first two are
 * assembled here, so this pins their layout.
 */
describe("ZKEmailModule public signals", () => {

    const VERIFIER_1024 = "0x72e48727b2ebbcc4bd59ad0b3aeb987a401ef3e8";
    const VERIFIER_2048 = "0x8c1edddf06eaaf860cf90dbde624b3810a431047";

    const address_map = new BasicAddressMap({
        zk_email_proof_1024: VERIFIER_1024,
        zk_email_proof_2048: VERIFIER_2048,
    });

    // The seven signals the email service returns: dkim_key_hash, domain[4], from_address_hash, subject.
    const publicSignals = ["0x01", "0x02", "0x03", "0x04", "0x05", "0x06", "0x07"];

    function moduleUnderTest() {
        return new ZKEmailModule(new StandardProofLibrary());
    }

    function ctx(overrides: Partial<ProofProductionContext> = {}): ProofProductionContext {
        return { dataStreams: [], upstream: {}, ...overrides } as unknown as ProofProductionContext;
    }

    it("puts the timestamp first and the verifier second, both padded to 32 bytes", async () => {
        const produced = await moduleUnderTest().produce(
            ctx({ timestamp: 1_800_000_000, address_map }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA2048" },
        );
        const signals = produced.public_inputs[0];

        expect(produced.proofs).to.deep.equal(["0xabcd"]);
        expect(signals[0]).to.equal("0x" + (1_800_000_000).toString(16).padStart(64, "0"));
        // Every signal is a bytes32; an unpadded 20-byte address breaks the bytes32[] encoding.
        expect(signals[1]).to.equal("0x" + VERIFIER_2048.slice(2).padStart(64, "0"));
        signals.forEach((signal: string) => expect(signal).to.match(/^0x[0-9a-f]{64}$/));
        // The circuit's own signals follow, in order.
        expect(signals.length).to.equal(2 + publicSignals.length);
    });

    it("selects the verifier from proof_type", async () => {
        const rsa1024 = await moduleUnderTest().produce(
            ctx({ timestamp: 1_800_000_000, address_map }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA1024" },
        );
        expect(rsa1024.public_inputs[0][1]).to.equal("0x" + VERIFIER_1024.slice(2).padStart(64, "0"));
    });

    it("takes the timestamp and address map from the context, and lets inputs override them", async () => {
        const other = new BasicAddressMap({ zk_email_proof_2048: "0x00000000000000000000000000000000000000ff" });
        const produced = await moduleUnderTest().produce(
            ctx({ timestamp: 1_800_000_000, address_map }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA2048", timestamp: 42, address_map: other },
        );
        expect(produced.public_inputs[0][0]).to.equal("0x" + (42).toString(16).padStart(64, "0"));
        expect(produced.public_inputs[0][1]).to.equal("0x" + "ff".padStart(64, "0"));
    });

    it("refuses to produce without a proving timestamp", async () => {
        await expect(moduleUnderTest().produce(
            ctx({ address_map }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA2048" },
        )).to.be.rejectedWith(/no proving timestamp/);
    });

    it("refuses to produce without an address map, and when the verifier is missing from it", async () => {
        await expect(moduleUnderTest().produce(
            ctx({ timestamp: 1_800_000_000 }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA2048" },
        )).to.be.rejectedWith(/no address map/);

        await expect(moduleUnderTest().produce(
            ctx({ timestamp: 1_800_000_000, address_map: new BasicAddressMap({}) }),
            { proof: "0xabcd", publicSignals, proof_type: "RSA2048" },
        )).to.be.rejectedWith(/no zk_email_proof_2048 address/);
    });

    it("declares proof_type as a required resolver input", () => {
        // The resolver used to return camelCase proofType, which silently selected the wrong verifier.
        expect(Object.keys(moduleUnderTest().productionInputs())).to.include("proof_type");
    });
});
