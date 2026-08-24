import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import {
    generateVaultKeypair,
    vaultPublicKeyFor,
    encryptForVault,
    decryptFromVault,
    decryptFromVaultToString,
} from "../src/lib/vault/vault_crypto";
import { cryptoTools } from "@nihilium/zkp-circuits";

/**
 * The vault keypair is what sealing now produces: the private key is sealed across the threshold paths
 * and dropped, the public key is published. Everything here runs with no chain and no processors —
 * which is the property being demonstrated, since encrypting into a vault must never need an unseal.
 */
describe("vault crypto", () => {

    it("derives the public key as sk * G", () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const [x, y] = cryptoTools.privateScalarToPubKey(privateKey);
        expect(BigInt(publicKey.x)).to.equal(BigInt(x));
        expect(BigInt(publicKey.y)).to.equal(BigInt(y));
        // Same scalar, same key — this is what lets a recovered secret be checked against a seal.
        expect(vaultPublicKeyFor(privateKey)).to.deep.equal(publicKey);
    });

    it("round trips a short string", async () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const blob = await encryptForVault(publicKey, "hunter2");
        expect(await decryptFromVaultToString(privateKey, blob)).to.equal("hunter2");
    });

    it("round trips data well beyond the 32-byte limit of the raw ECC helper", async () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const long = "x".repeat(10_000);
        const blob = await encryptForVault(publicKey, long);
        expect(await decryptFromVaultToString(privateKey, blob)).to.equal(long);
    });

    it("round trips unicode and raw bytes", async () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const unicode = "pässwörd — 🔐 秘密";
        expect(await decryptFromVaultToString(privateKey, await encryptForVault(publicKey, unicode)))
            .to.equal(unicode);

        const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
        const out = await decryptFromVault(privateKey, await encryptForVault(publicKey, bytes));
        expect(Array.from(out)).to.deep.equal(Array.from(bytes));
    });

    it("gives every blob a fresh ephemeral key", async () => {
        const { publicKey } = generateVaultKeypair();
        const a = await encryptForVault(publicKey, "same plaintext");
        const b = await encryptForVault(publicKey, "same plaintext");
        expect(a.R.x).to.not.equal(b.R.x);
        expect(a.ciphertext).to.not.equal(b.ciphertext);
    });

    it("refuses the wrong vault key instead of returning garbage", async () => {
        const alice = generateVaultKeypair();
        const bob = generateVaultKeypair();
        const blob = await encryptForVault(alice.publicKey, "alice's secret");
        await expect(decryptFromVault(bob.privateKey, blob)).to.be.rejectedWith(/does not belong/);
    });

    it("refuses a tampered ciphertext", async () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const blob = await encryptForVault(publicKey, "integrity matters");
        const flipped = blob.ciphertext.slice(0, -1) + (blob.ciphertext.endsWith("0") ? "1" : "0");
        await expect(decryptFromVault(privateKey, { ...blob, ciphertext: flipped }))
            .to.be.rejectedWith(/does not belong|modified/);
    });

    it("rejects an unknown algorithm tag", async () => {
        const { privateKey, publicKey } = generateVaultKeypair();
        const blob = await encryptForVault(publicKey, "x");
        await expect(decryptFromVault(privateKey, { ...blob, alg: "AES-CBC" as any }))
            .to.be.rejectedWith(/Unsupported vault blob algorithm/);
    });
});
