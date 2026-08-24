import { expect } from "chai";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import axios from "axios";
import { cryptoTools } from "@nihilium/zkp-circuits";
chai.use(chaiAsPromised);

import { Processor } from "../src/lib/processor/processor";
import { IDualDataStream } from "../src/lib/data_stream/types";
import { EVMDataStreamDualMerkleNonZK } from "../src/lib/data_stream/EVMDataStreamDualMerkleNonZK";
import { ClientSingleShareSealingProcess } from "../src/lib/client/client_single_share_sealing";
import { UnsealPathProducer } from "../src/lib/unseal_conditions/UnsealPathProducer";
import { ModuleProof, ProofProductionContext, UnsealConditionModule } from "../src/lib/unseal_conditions/modules";
import { UnsealConditionTemplate as UCTemplate } from "../src/lib/unseal_conditions/collections/UnsealConditionTemplate";
import { DefaultUnsealingClient } from "../src/lib/client/scenarios/default_unsealing_client";
import {
    NihiliumSealingClient,
    NihiliumSealingStatus,
    ProcessorSealPhase,
    InMemorySealingStateStore,
    NihiliumUnsealingClient,
    NihiliumUnsealingStatus,
    ProcessorUnsealPhase,
    InMemoryUnsealingStateStore,
    hashRequestBody,
} from "../src/lib/client";
import { ProcessorEndpoint, PROTOCOL_PROCESSOR_PATHS, SingleSealRequest, SingleUnsealRequest, VaultPublicKey } from "../src/types/protocol/common";
import { encryptForVault, vaultPublicKeyFor } from "../src/lib/vault/vault_crypto";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { IDataStreamPersistence } from "../src/lib/persistence/types";
import { DataStreamFilePersistence } from "../src/lib/persistence/DataStreamFilePersistence";
import { UnsealConditionTemplate } from "../src/lib/unseal_conditions/collections/UnsealConditionTemplate";
import { createRevealOnlyCollection } from "../src/lib/unseal_conditions/templates/reveal_only_template";
import { UnsealConditionCollection } from "../src/lib/unseal_conditions/collections/UnsealConditionCollection";
import { createKeccakMerkelTree } from "../src/lib/utils";
import { NETWORK_IDS, deployedProtocolContracts } from "../src/static_contracts";
import { NihiliumSeal } from "../src/types/protocol/common";

// Small combinatorial config keeps the (real, IPFS-fetched, Groth16) proving cost tractable.
const N = 3; // processors
const K = 2; // threshold
const M = 1; // search width
const binomial = (n: number, k: number) => {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
};

describe("NihiliumSealingClient + NihiliumUnsealingClient combinatorial-threshold", () => {
    let processors: Processor[] = [];
    let endpoints: ProcessorEndpoint[] = [];
    let data_stream: IDualDataStream;
    let revealOnlyTemplate: { collection: UnsealConditionCollection; template: UnsealConditionTemplate };
    let signers: Signer[];

    // A seal produced once and reused by the unseal tests (each seal is 3 real ZK proofs).
    let sharedVaultPublicKey: VaultPublicKey;
    let sharedSeal: NihiliumSeal;

    // Count of paid seal POSTs dispatched (proxy for processor charges).
    let sealPostCount = 0;
    let originalPost: typeof axios.post;

    before(async () => {
        signers = (await ethers.getSigners()) as unknown as Signer[];

        // ---- Deploy the protocol contracts (mirrors full.test.ts) ----
        const openingProofC = await ethers.getContractFactory("opening_proof");
        const openingProof = await openingProofC.deploy();
        deployedProtocolContracts[NETWORK_IDS.CUSTOM]["opening_proof"] = {
            address: await openingProof.getAddress(),
            bytecode: openingProofC.bytecode,
            abi: openingProofC.interface.fragments.map((f: any) => f),
        };

        const encryptProofC = await ethers.getContractFactory("encrypt_proof");
        await encryptProofC.deploy();

        const topLevelMerkleProofC = await ethers.getContractFactory("TopLevelMerkleProof");
        const topLevelMerkleProof = await topLevelMerkleProofC.deploy();
        deployedProtocolContracts[NETWORK_IDS.CUSTOM]["TopLevelMerkleProof"] = {
            address: await topLevelMerkleProof.getAddress(),
            bytecode: topLevelMerkleProofC.bytecode,
            abi: topLevelMerkleProofC.interface.fragments.map((f: any) => f),
        };

        const subTreeMerkleProofC = await ethers.getContractFactory("MerkleTreeProof");
        const subTreeMerkleProof = await subTreeMerkleProofC.deploy();
        deployedProtocolContracts[NETWORK_IDS.CUSTOM]["MerkleTreeProof"] = {
            address: await subTreeMerkleProof.getAddress(),
            bytecode: subTreeMerkleProofC.bytecode,
            abi: subTreeMerkleProofC.interface.fragments.map((f: any) => f),
        };

        const keccakTreeEntryC = await ethers.getContractFactory("KeccakTreeEntry");
        const keccakTreeEntryContract = await keccakTreeEntryC.deploy();
        deployedProtocolContracts[NETWORK_IDS.CUSTOM]["KeccakTreeEntry"] = {
            address: await keccakTreeEntryContract.getAddress(),
            bytecode: keccakTreeEntryC.bytecode,
            abi: keccakTreeEntryC.interface.fragments.map((f: any) => f),
        };

        const merkleTree = await ethers.getContractFactory("EmpheralDualMerkleTreeKeccak");
        const merkleTreeContract = await merkleTree.deploy(signers[0], 24);
        const merkleTreeContractAddress = await merkleTreeContract.getAddress();

        const chainedProofC = await ethers.getContractFactory("ChainedProofV2");
        const chainedProofContract = await chainedProofC.deploy(
            deployedProtocolContracts[NETWORK_IDS.CUSTOM]["opening_proof"].address,
            deployedProtocolContracts[NETWORK_IDS.CUSTOM]["opening_proof"].address,
        );
        deployedProtocolContracts[NETWORK_IDS.CUSTOM]["ChainedProofV2"] = {
            address: await chainedProofContract.getAddress(),
            bytecode: chainedProofC.bytecode,
            abi: chainedProofC.interface.fragments.map((f: any) => f),
        };

        // ---- Data stream ----
        const persistence: IDataStreamPersistence = new DataStreamFilePersistence(
            "./test_data/" + Date.now().toString(),
            createKeccakMerkelTree,
        );
        data_stream = new EVMDataStreamDualMerkleNonZK(
            "test", persistence, merkleTreeContractAddress, signers[0], 10, 20, 10,
        );
        await data_stream.initialize();

        // ---- N processors, each with its own keys + endpoint ----
        processors = [];
        endpoints = [];
        for (let i = 0; i < N; i++) {
            const he_encryption = cryptoTools.genKeypair();
            const signing_key = cryptoTools.genKeypair();
            const addsPubKey = await cryptoTools.deriveSigningPublicKey("0x" + signing_key.privKey.toString(16));

            const processor = new Processor(
                "0x" + signing_key.privKey.toString(16),
                "0x" + he_encryption.privKey.toString(16),
                deployedProtocolContracts[NETWORK_IDS.CUSTOM]["ChainedProofV2"].address,
                deployedProtocolContracts[NETWORK_IDS.CUSTOM]["opening_proof"].address,
                signers[0],
            );
            await processor.initialize();
            processors.push(processor);

            endpoints.push({
                url: "http://proc.local/" + i, // distinct so the shim can route
                is_tor: false,
                public_verification_key: [addsPubKey[0], addsPubKey[1]],
                public_he_encryption_key: cryptoTools.toBigIntArray(he_encryption.pubKey),
                server_address: ("0x" + i.toString().padStart(40, "0")) as any,
            });
        }

        revealOnlyTemplate = createRevealOnlyCollection(NETWORK_IDS.CUSTOM);

        // ---- In-process shim for the processor endpoints (no HTTP server in tests) ----
        originalPost = axios.post;
        (axios as any).post = async (url: string, body: any) => {
            const sealIdx = endpoints.findIndex((e) => url === e.url + PROTOCOL_PROCESSOR_PATHS.REQUEST_SEAL);
            if (sealIdx !== -1) {
                sealPostCount++;
                const data = await processors[sealIdx].process_seal_request(body as SingleSealRequest);
                return { status: 200, data } as any;
            }
            const unsealIdx = endpoints.findIndex((e) => url === e.url + PROTOCOL_PROCESSOR_PATHS.REQUEST_UNSEAL);
            if (unsealIdx !== -1) {
                const data = await processors[unsealIdx].process_unseal_request(body as SingleUnsealRequest);
                return { status: 200, data } as any;
            }
            throw new Error("Unexpected POST in test: " + url);
        };
    });

    after(() => {
        if (originalPost) (axios as any).post = originalPost;
    });

    function makeClient(): NihiliumSealingClient {
        return new NihiliumSealingClient(
            endpoints, [data_stream], revealOnlyTemplate.template, K, undefined, undefined, M,
        );
    }

    it("seals across N processors and produces one C(N,K) fdt_seal", async () => {
        const metadata_root = cryptoTools.generateRandom248BitNumber();

        const client = makeClient();
        client.set_state_store(new InMemorySealingStateStore());

        // Pass a bigint template input (field elements are bigints, e.g. email_address_hash) to exercise
        // the state/storage-key serialization path — this used to throw "Do not know how to serialize a BigInt".
        const seal = await client.start_sealing(
            metadata_root,
            { debug_bigint_input: 987654321987654321987654321n },
            { datastream: data_stream.getAddress() },
        );

        expect(client.is_done()).to.equal(true);
        expect(client.get_status()).to.equal(NihiliumSealingStatus.Sealed);
        expect(seal.packages.length).to.equal(N);
        for (const pkg of seal.packages) {
            expect(pkg.private_package.constructed_public_key.length).to.equal(2);
        }
        expect(seal.fdt_seal.threshold).to.equal(K);
        expect(seal.fdt_seal.m).to.equal(M);
        expect(Object.keys(seal.fdt_seal.combinations).length).to.equal(binomial(N, K));

        // Sealing now yields a vault keypair: the public half is published on the seal and the private
        // half is what the threshold protects (the unseal round-trip below proves they match).
        expect(seal.vault_public_key).to.not.equal(undefined);
        expect(client.get_vault_public_key()).to.deep.equal(seal.vault_public_key);
    });

    it("resumes after a crash during proving without re-charging the processor", async () => {
        const metadata_root = cryptoTools.generateRandom248BitNumber();
        const store = new InMemorySealingStateStore(); // shared across both client instances
        const mapping = { datastream: data_stream.getAddress() };

        const countBefore = sealPostCount;

        // Patch the ZK-proof step to throw exactly once, simulating a crash after the paid POST.
        const realProcess = ClientSingleShareSealingProcess.prototype.process_seal_response;
        let thrown = false;
        (ClientSingleShareSealingProcess.prototype as any).process_seal_response = async function (resp: any) {
            if (!thrown) {
                thrown = true;
                throw new Error("simulated proof crash");
            }
            return realProcess.call(this, resp);
        };

        try {
            const clientA = makeClient();
            clientA.set_state_store(store);
            await expect(clientA.start_sealing(metadata_root, {}, mapping)).to.be.rejectedWith("simulated proof crash");
            expect(clientA.get_status()).to.equal(NihiliumSealingStatus.Failed);

            // The first processor was paid and its response persisted, awaiting the proof.
            const storageKey = `nihilium_sealing_${hashRequestBody({
                metadata_root: metadata_root.toString(),
                threshold: K,
                search_width: M,
                template_inputs: {},
                data_stream_mapping: mapping,
                processors: endpoints.map((e) => e.server_address),
            })}`;
            const saved = store.load(storageKey);
            expect(saved!.per_processor[0].phase).to.equal(ProcessorSealPhase.Responded);
            expect(saved!.per_processor[0].raw_response).to.not.equal(undefined);

            // Resume with a fresh client sharing the same store.
            const postsAfterCrash = sealPostCount;
            const clientB = makeClient();
            clientB.set_state_store(store);
            const seal = await clientB.start_sealing(metadata_root, {}, mapping);

            expect(clientB.is_done()).to.equal(true);
            expect(seal.packages.length).to.equal(N);
            // The resume must seal the SAME vault key it started with — a regenerated one would leave
            // the published public key pointing at a key nobody can recover.
            expect(seal.vault_public_key).to.deep.equal(saved!.vault_public_key);
            // The already-responded processor is NOT re-POSTed: total POSTs == N (1 pre-crash + N-1 on resume).
            expect(sealPostCount - countBefore).to.equal(N);
            // and the resume itself only POSTed the N-1 not-yet-responded processors.
            expect(sealPostCount - postsAfterCrash).to.equal(N - 1);
        } finally {
            (ClientSingleShareSealingProcess.prototype as any).process_seal_response = realProcess;
        }
    });

    // ---- Unseal tests: seal once, reuse across them ----
    // Uses DefaultUnsealingClient (the reveal-only scenario subclass) so the round-trip + crash-resume
    // tests exercise the inheritance refactor end-to-end; it is behaviorally the base client.
    function makeUnsealingClient(seal: NihiliumSeal): NihiliumUnsealingClient {
        return new DefaultUnsealingClient(seal, endpoints, [data_stream], {
            collection: revealOnlyTemplate.collection,
        });
    }

    before(async () => {
        const metadata_root = cryptoTools.generateRandom248BitNumber();
        const sealingClient = makeClient();
        sealingClient.set_state_store(new InMemorySealingStateStore());
        // Omit the data-stream mapping to exercise auto-derivation (the reveal-only template has a
        // single datastream input); the unseal round-trip below verifies it end-to-end.
        sharedSeal = await sealingClient.start_sealing(metadata_root);
        // The vault private key is never handed back, so the expectation is derived from the published
        // public key: whatever the unseal recovers must be the scalar behind it.
        sharedVaultPublicKey = sealingClient.get_vault_public_key();
    });

    it("recovers the vault key via NihiliumUnsealingClient (K-of-N threshold, fdt_seal)", async () => {
        const client = makeUnsealingClient(sharedSeal);
        client.set_state_store(new InMemoryUnsealingStateStore());

        const recovered = await client.start_unsealing([0, 1]);

        // The recovered scalar is the vault private key: it must be the discrete log of the public key
        // the seal published, which is what makes blobs encrypted to that key decryptable.
        expect(vaultPublicKeyFor(recovered)).to.deep.equal(sharedVaultPublicKey);
        expect(sharedSeal.vault_public_key).to.deep.equal(sharedVaultPublicKey);
        expect(client.is_done()).to.equal(true);
        expect(client.get_status()).to.equal(NihiliumUnsealingStatus.Unsealed);
        expect(client.get_vault_private_key()).to.equal(recovered);
    });

    it("decrypts data encrypted to the vault public key with no unseal at encryption time", async () => {
        // The property the vault design exists for: anyone holding the seal can add data to the vault.
        const blob = await encryptForVault(sharedSeal.vault_public_key!, "added long after sealing");

        const client = makeUnsealingClient(sharedSeal);
        client.set_state_store(new InMemoryUnsealingStateStore());
        await client.start_unsealing([0, 1]);

        expect(await client.decrypt_vault_blob_to_string(blob)).to.equal("added long after sealing");
    });

    it("resumes an unseal after a crash during proving", async () => {
        const store = new InMemoryUnsealingStateStore(); // shared across both client instances

        // Fail the second processor's unseal proof exactly once (crash after the first is recovered).
        // Proof production now lives on UnsealPathProducer.produce (one producer per start_unsealing,
        // called once per processor), so inject the crash there.
        const realProduce = UnsealPathProducer.prototype.produce;
        let produceCalls = 0;
        (UnsealPathProducer.prototype as any).produce = async function (...args: any[]) {
            produceCalls++;
            if (produceCalls === 2) {
                throw new Error("simulated unseal proof crash");
            }
            return (realProduce as any).apply(this, args);
        };

        try {
            const clientA = makeUnsealingClient(sharedSeal);
            clientA.set_state_store(store);
            await expect(clientA.start_unsealing([0, 1])).to.be.rejectedWith("simulated unseal proof crash");
            expect(clientA.get_status()).to.equal(NihiliumUnsealingStatus.Failed);

            const storageKey = `nihilium_unsealing_${hashRequestBody({
                reveal_values: sharedSeal.packages.map((p) => p.public_package.reveal_value),
                processor_indices: [0, 1],
                threshold: K,
            })}`;
            const saved = store.load(storageKey);
            expect(saved!.per_processor[0].phase).to.equal(ProcessorUnsealPhase.Unsealed);
            expect(saved!.per_processor[1].phase).to.equal(ProcessorUnsealPhase.Pending);

            // Resume with a fresh client sharing the store; the second processor now succeeds.
            const clientB = makeUnsealingClient(sharedSeal);
            clientB.set_state_store(store);
            const recovered = await clientB.start_unsealing([0, 1]);

            expect(clientB.is_done()).to.equal(true);
            expect(vaultPublicKeyFor(recovered)).to.deep.equal(sharedVaultPublicKey);
        } finally {
            (UnsealPathProducer.prototype as any).produce = realProduce;
        }
    });

    it("rejects a subset whose size is not the threshold", async () => {
        // Validation happens before any proving, so a minimal fake seal suffices.
        const fakeSeal = {
            packages: new Array(N).fill({}),
            fdt_seal: { threshold: K, m: M, combinations: {} },
        } as unknown as NihiliumSeal;
        const client = new NihiliumUnsealingClient(fakeSeal, endpoints, [data_stream]);
        client.set_state_store(new InMemoryUnsealingStateStore());
        await expect(client.start_unsealing([0])).to.be.rejectedWith(/threshold/);
    });
});

// Lightweight, ZK-free unit tests of the producer's shared/per-processor routing, produce-once caching,
// caller-preselected proofs, and the safety guard. Uses stub modules + a fake compiled template so it
// needs no contracts or real proving.
describe("UnsealPathProducer shared/per-processor routing", () => {
    function stubModule(opts: {
        unique: boolean;
        requires?: string[];
        produce: (ctx: ProofProductionContext, inputs: any) => ModuleProof;
    }): UnsealConditionModule {
        return {
            requires_unique_proof_per_processor: opts.unique,
            productionInputs: () =>
                (opts.requires ?? []).reduce((m: any, k: string) => { m[k] = {}; return m; }, {}),
            produce: async (ctx: ProofProductionContext, inputs: any) => opts.produce(ctx, inputs),
        } as unknown as UnsealConditionModule;
    }

    // Path [opening (unique), email (shared)] — mirrors the real graph's per-processor-then-shared shape.
    function makeProducer(moduleFor: (name: string) => UnsealConditionModule): UnsealPathProducer {
        const template = {
            isCompiled: () => true,
            proof_library: {} as any,
            module_library: { getModule: (name: string) => moduleFor(name) } as any,
            compiled_collection: {
                compiled_modules: [[
                    { module_id: "opening", module_name: "opening" },
                    { module_id: "email", module_name: "email" },
                ]],
            } as any,
        } as unknown as UCTemplate;
        return new UnsealPathProducer(template);
    }

    const ctx = (): ProofProductionContext =>
        ({ dataStreams: [] as any, processor: {} as any, seal: {} as any, upstream: {} });

    it("classifies only flagged modules as per-processor", () => {
        const producer = makeProducer((name) =>
            name === "opening"
                ? stubModule({ unique: true, produce: () => ({ proofs: ["u"], public_inputs: [["u"]], outputs: {} }) })
                : stubModule({ unique: false, produce: () => ({ proofs: ["s"], public_inputs: [["s"]], outputs: {} }) }),
        );
        const perProc = producer.perProcessorModuleIds(0);
        expect([...perProc]).to.deep.equal(["opening"]);
    });

    it("produces shared modules once and per-processor modules per processor", async () => {
        let uniqueCalls = 0;
        let sharedCalls = 0;
        const producer = makeProducer((name) =>
            name === "opening"
                ? stubModule({ unique: true, produce: () => { uniqueCalls++; return { proofs: ["u" + uniqueCalls], public_inputs: [["u"]], outputs: {} }; } })
                : stubModule({ unique: false, produce: () => { sharedCalls++; return { proofs: ["s"], public_inputs: [["s"]], outputs: {} }; } }),
        );
        const perProc = producer.perProcessorModuleIds(0);
        const sharedMemo: { [id: string]: ModuleProof } = {};

        // Drive the same cross-processor loop the client runs.
        const assembled: any[][] = [];
        for (let i = 0; i < 2; i++) {
            const callMemo: { [id: string]: ModuleProof } = { ...sharedMemo };
            const { proofs } = await producer.produce(0, ctx(), {}, callMemo);
            for (const [mid, mp] of Object.entries(callMemo)) {
                if (!perProc.has(mid) && !sharedMemo[mid]) sharedMemo[mid] = mp;
            }
            assembled.push(proofs);
        }

        expect(uniqueCalls).to.equal(2);          // opening re-produced per processor
        expect(sharedCalls).to.equal(1);          // email produced once, reused
        expect(assembled[0]).to.deep.equal(["u1", "s"]);
        expect(assembled[1]).to.deep.equal(["u2", "s"]); // same shared proof, order preserved
    });

    it("uses caller-preselected proofs in place of producing them", async () => {
        let sharedCalls = 0;
        const producer = makeProducer((name) =>
            name === "opening"
                ? stubModule({ unique: true, produce: () => ({ proofs: ["u1"], public_inputs: [["u"]], outputs: {} }) })
                : stubModule({ unique: false, produce: () => { sharedCalls++; return { proofs: ["s"], public_inputs: [["s"]], outputs: {} }; } }),
        );
        const provided: ModuleProof = { proofs: ["provided"], public_inputs: [["p"]], outputs: {} };
        const callMemo: { [id: string]: ModuleProof } = { email: provided };
        const { proofs } = await producer.produce(0, ctx(), {}, callMemo);

        expect(sharedCalls).to.equal(0);          // email never produced — the preselected proof was used
        expect(proofs).to.deep.equal(["u1", "provided"]);
    });

    it("refuses to share a module that reads a per-processor upstream output", async () => {
        const producer = makeProducer((name) =>
            name === "opening"
                ? stubModule({ unique: true, produce: () => ({ proofs: ["u"], public_inputs: [["u"]], outputs: {} }) })
                // A shared (unflagged) module that illegally consumes the per-processor opening output.
                : stubModule({ unique: false, produce: (c) => { void c.upstream["opening"]; return { proofs: ["s"], public_inputs: [["s"]], outputs: {} }; } }),
        );
        await expect(producer.produce(0, ctx(), {}, {})).to.be.rejectedWith(/per-processor module/);
    });
});

// Regression: hashRequestBody (used for the seal storage key) must tolerate bigint field values.
describe("hashRequestBody bigint-safety", () => {
    it("hashes a body containing bigints without throwing", () => {
        const withBigints = { metadata_root: "1", template_inputs: { email_address_hash: 123456789012345678901234567890n } };
        const withStrings = { metadata_root: "1", template_inputs: { email_address_hash: "123456789012345678901234567890" } };
        const hash = hashRequestBody(withBigints);
        expect(hash).to.be.a("string");
        // A bigint and its decimal-string form hash identically, so string-normalized state keeps a stable key.
        expect(hash).to.equal(hashRequestBody(withStrings));
    });
});

// The ZKEmail scenario moved to @nihilium/client-sdk; its wiring tests live alongside it there
// (packages/client-sdk/test/zkemail_unsealing_client.test.ts).
