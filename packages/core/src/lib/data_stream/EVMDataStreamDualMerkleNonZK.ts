import { HexString } from "../../types/protocol/common";
import { MerkleTree } from 'fixed-merkle-tree'
import process from 'node:process';
import { IDualDataStream, DualProofResult, DualLatestGlobalLeafProofResult } from "./types";
import { toPaddedHex, keccakTreeHasher, createKeccakMerkelTree, signDataInsertRequestJWT, ZERO_KECCAK } from "../utils";

import { GlobalLeafEntry, IDataStreamPersistence, OnChainPublishingState } from "../persistence/types";
import { Signer } from "ethers";

import { cryptoTools } from "@nihilium/zkp-circuits";
import { EmpheralDualMerkleTreeWrapper } from "../contract_wrappers/EmpheralDualMerkleTreeWrapper";


/**
 * Data stream backed by the dual Merkle tree contract.
 *
 * The value tree is identical to EVMDataStreamNonZK: each leaf is
 *   keccak(subtreeRoot, keccak(timestamp, blockHash))
 *
 * The dual tree accumulates value-tree roots as its leaves (raw, no extra
 * hashing). This lets callers prove a historical value-tree root was ever
 * a valid state using only the current dual root.
 *
 * getProof() returns [dualProof, globalProof, localProof, timestamp, globalIndex, localIndex, blockHash]
 */
export class EVMDataStreamDualMerkleNonZK implements IDualDataStream {
    private id: string;
    private merkleTree: MerkleTree;
    private globalValueTree: MerkleTree;
    private globalDualTree: MerkleTree;
    private globalLeafTimestamps: Map<string, number>;
    private globalLeafBlockHashes: Map<string, string>;
    // Same data as the two maps above, but positional: entry i is round i. Needed to answer "when was
    // round i anchored" for a specific occurrence of a value.
    private globalLeafEntries: GlobalLeafEntry[];
    private depth: number;
    private signer: Signer;
    private persistence: IDataStreamPersistence;
    private global_evm_merkle_tree: EmpheralDualMerkleTreeWrapper;
    private publishing_interval_in_seconds: number;

    private lastKnownTimestamp: number = 0;
    private max_local_tree_elements: number = 50;
    private global_tree_address: string;
    private forced_publication_interval_in_seconds: number = -1;
    private on_chain_publishing_state: OnChainPublishingState = {
        processing_local_tree: -1,
        local_trees_to_process: []
    }
    private postDataLock: Promise<void> = Promise.resolve();

    constructor(
        id: string,
        persistence: IDataStreamPersistence,
        global_tree_address: string,
        signer: Signer,
        publishing_interval_in_seconds: number = 10,
        depth: number = 24,
        max_local_tree_elements: number = -1,
        forced_publication_interval_in_seconds: number = -1
    ) {
        this.depth = depth
        this.id = id
        this.persistence = persistence
        this.merkleTree = new MerkleTree(depth, [])
        this.globalValueTree = new MerkleTree(depth, [])
        this.globalDualTree = new MerkleTree(depth, [])
        this.globalLeafTimestamps = new Map<string, number>()
        this.globalLeafBlockHashes = new Map<string, string>()
        this.globalLeafEntries = []
        this.max_local_tree_elements = max_local_tree_elements > 0 ? max_local_tree_elements : (2 ** depth - 1) - 1000
        this.signer = signer
        this.global_evm_merkle_tree = new EmpheralDualMerkleTreeWrapper(signer)
        this.global_tree_address = global_tree_address
        this.publishing_interval_in_seconds = publishing_interval_in_seconds
        this.forced_publication_interval_in_seconds = forced_publication_interval_in_seconds
    }

    hasDataStreamRoot: (root: string) => Promise<boolean> = async (root: string) => {
        return this.global_evm_merkle_tree.isKnownDualRoot(root)
    };

    getUrl(): string {
        return this.id
    }

    getAddress(): string {
        return this.global_tree_address
    }

    private async load_everything(): Promise<void> {
        this.global_evm_merkle_tree = new EmpheralDualMerkleTreeWrapper(this.signer)
        await this.global_evm_merkle_tree.attach(this.global_tree_address)
        this.on_chain_publishing_state = await this.persistence.getOnChainPublishingState()
        this.merkleTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex())
        this.globalValueTree = await this.persistence.getGlobalValueTree()
        this.globalDualTree = await this.persistence.getGlobalDualTree()
        this.globalLeafTimestamps = await this.persistence.getGlobalLeafTimestamps()
        this.globalLeafBlockHashes = await this.persistence.getGlobalLeafBlockHashes()
        this.globalLeafEntries = await this.persistence.getGlobalLeafEntries()
    }

    async initialize(): Promise<void> {
        await this.load_everything()
        await this.resyncGlobalTree()
        if (this.on_chain_publishing_state.processing_local_tree >= 0 && this.on_chain_publishing_state.local_trees_to_process.length > 0) {
            await this.processGlobalTreeInsert(true)
        }
        await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
        setInterval(async () => {
            await this.processGlobalTreeInsert()
        }, 3000)

        if (this.forced_publication_interval_in_seconds > 0) {
            setInterval(async () => {
                console.log("Forced publication")
                await this.postData([toPaddedHex(cryptoTools.generateRandom248BitNumber())])
            }, this.forced_publication_interval_in_seconds * 1000)
        }
    }

    private async resyncGlobalTree(force: boolean = false): Promise<void> {
        const currentContractGlobalRoot = await this.global_evm_merkle_tree.getLastMerkleRoot()
        console.log("Current contract global root", currentContractGlobalRoot)
        console.log("Current global root", this.globalValueTree.root)
        console.log("Current contract global tree index", await this.global_evm_merkle_tree.getCurrentIndex())
        console.log("Current global tree index", this.getGlobalTreeIndex())

        var hasher = keccakTreeHasher;

        if (force || currentContractGlobalRoot != this.globalValueTree.root) {
            try {
                const lastInsertEvent = await this.global_evm_merkle_tree.getLastInsertEvent()
                const localLeaf = hasher(
                    BigInt(lastInsertEvent.newValueRoot),
                    hasher(lastInsertEvent.timestamp, BigInt(lastInsertEvent.blockHash))
                )
                this.globalValueTree.insert(localLeaf)
                if (this.globalValueTree.root != currentContractGlobalRoot) {
                    console.log("Global tree root does not match", this.globalValueTree.root, currentContractGlobalRoot)
                    force = true
                } else {
                    await this.persistence.storeGlobalValueTreeLeaf(
                        lastInsertEvent.newValueRoot,
                        Number(lastInsertEvent.timestamp),
                        lastInsertEvent.blockHash
                    )
                    await this.persistence.storeGlobalDualTreeLeaf(lastInsertEvent.newMerkleRoot)
                    this.on_chain_publishing_state.processing_local_tree = -1
                    this.on_chain_publishing_state.local_trees_to_process.shift()
                    await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
                    console.log("Recovered from last unseen", lastInsertEvent)
                }
            } catch (error) {
                console.error("Error getting last insert event", error)
                force = true
            }
        }

        const currentContractGlobalTreeIndex = await this.global_evm_merkle_tree.getCurrentIndex()
        if (force || currentContractGlobalTreeIndex > this.getGlobalTreeIndex()) {
            const events = await this.global_evm_merkle_tree.getTreeUpdateEvents()
            await this.persistence.resetContractTrees()
            await this.persistence.resetDualTree()
            for (const event of events) {
                await this.persistence.storeGlobalValueTreeLeaf(
                    toPaddedHex(event.value),
                    event.timestamp,
                    toPaddedHex(event.blockHash)
                )
                await this.persistence.storeGlobalDualTreeLeaf(toPaddedHex(event.newValueRoot))
            }
        }

        this.globalValueTree = await this.persistence.getGlobalValueTree()
        this.globalDualTree = await this.persistence.getGlobalDualTree()
        // A resync can rewrite global_value.txt wholesale, so the round/timestamp views loaded before it
        // ran are stale from here on.
        this.globalLeafTimestamps = await this.persistence.getGlobalLeafTimestamps()
        this.globalLeafBlockHashes = await this.persistence.getGlobalLeafBlockHashes()
        this.globalLeafEntries = await this.persistence.getGlobalLeafEntries()
    }

    getGlobalTreeIndex(): number {
        return this.globalValueTree.elements.length
    }

    /**
     * Pick WHICH publication of a value a proof is built from. The same value can be posted any number
     * of times — by its owner or by anyone else — so occurrences are scanned in publication order and
     * the earliest one that is both anchored on chain and anchored at or after `from` wins.
     *
     * `from` defaults to 0, i.e. the earliest occurrence, which is what keeps an unpinned proof stable:
     * a later republication by a third party can never move it forward.
     */
    private async selectOccurrence(value: HexString, from: number = 0): Promise<{
        globalIndex: number, localIndex: number, entry: GlobalLeafEntry
    } | undefined> {
        const occurrences = await this.persistence.getIndexedLocalLeaf(keccakTreeHasher(BigInt(value), 0n))
        for (const [globalIndex, localIndex] of occurrences) {
            // Rounds at or beyond the current global index are posted but not yet anchored on chain.
            if (globalIndex >= this.getGlobalTreeIndex()) continue
            const localTree = await this.persistence.getLocalTree(globalIndex)
            if (!localTree) continue
            if (!localTree.elements[localIndex]) continue
            const entry = await this.leafEntryFor(globalIndex, localTree)
            // An unknown anchoring time (0) cannot be shown to satisfy a lower bound, so it is only
            // selectable unfiltered — which is exactly how this behaved before `from` existed.
            if (from > 0 && entry.timestamp < from) continue
            return { globalIndex, localIndex, entry }
        }
        return undefined
    }

    /**
     * When a round was anchored: the positional view first, then a reload (a resync rewrites
     * global_value.txt wholesale, so the cached array can lag the value tree), and finally the
     * root-keyed maps this used to be resolved from. The last fallback keeps the unfiltered selection
     * working even when the round data is missing, with the same 0 / "0x0" placeholders as before.
     */
    private async leafEntryFor(globalIndex: number, localTree: MerkleTree): Promise<GlobalLeafEntry> {
        let entry = this.globalLeafEntries[globalIndex]
        if (!entry) {
            this.globalLeafEntries = await this.persistence.getGlobalLeafEntries()
            entry = this.globalLeafEntries[globalIndex]
        }
        if (entry) return entry
        const rootKey = toPaddedHex(BigInt(localTree.root))
        return {
            root: rootKey,
            timestamp: this.globalLeafTimestamps.get(rootKey) || 0,
            blockHash: this.globalLeafBlockHashes.get(rootKey) || "0x0",
        }
    }

    async isProvable(value: HexString, from: number = 0): Promise<boolean> {
        return (await this.selectOccurrence(value, from)) !== undefined
    }

    private async closeLocalTree(force: boolean = false): Promise<void> {
        if (force || this.merkleTree.elements.length >= this.max_local_tree_elements || (
            (Date.now() - this.lastKnownTimestamp > this.publishing_interval_in_seconds * 1000)
            && this.merkleTree.elements.length > 1
            && this.on_chain_publishing_state.processing_local_tree == -1)
        ) {
            console.log("Closing local tree, elements length", this.merkleTree.elements.length)
            this.merkleTree = await createKeccakMerkelTree(this.depth, [])
            this.on_chain_publishing_state.local_trees_to_process.push(this.getGlobalTreeIndex())
            this.lastKnownTimestamp = Date.now()
            await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
        }
    }

    private async processGlobalTreeInsert(force: boolean = false): Promise<void> {
        await this.closeLocalTree()
        try {
            if (force || (this.on_chain_publishing_state.processing_local_tree == -1 && this.on_chain_publishing_state.local_trees_to_process.length > 0)) {
                console.log("Processing dual global tree insert")
                this.on_chain_publishing_state.processing_local_tree = this.on_chain_publishing_state.local_trees_to_process[0]
                await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)

                var localTree = await this.persistence.getLocalTree(this.on_chain_publishing_state.processing_local_tree)
                var previousValueLeaf = this.globalValueTree.elements.at(-1)?.toString()
                var insert_value_proof = this.globalValueTree.path(this.globalValueTree.elements.length - 1).pathElements.map((element: any) => toPaddedHex(BigInt(element)))
                var newSubTreeRoot = toPaddedHex(BigInt(localTree.root))

                // Build the dual tree path for the previous dual leaf
                var previousDualLeaf = this.globalDualTree.elements.at(-1)?.toString() || ZERO_KECCAK
                var insert_dual_proof = this.globalDualTree.path(this.globalDualTree.elements.length - 1).pathElements.map((element: any) => toPaddedHex(BigInt(element)))

                console.log("Dual inserting", newSubTreeRoot, previousValueLeaf)
                var { index, timestamp, blockHash, newValueRoot, newDualRoot } = await this.global_evm_merkle_tree.insert(
                    previousValueLeaf || "",
                    newSubTreeRoot,
                    insert_value_proof,
                    previousDualLeaf,
                    insert_dual_proof
                )

                if (!timestamp) {
                    console.log("No timestamp found for local tree", newSubTreeRoot)
                }

                var localLeafHash = keccakTreeHasher(BigInt(newSubTreeRoot), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash)))
                this.globalValueTree.insert(localLeafHash)
                if (toPaddedHex(BigInt(newValueRoot)) != toPaddedHex(BigInt(this.globalValueTree.root))) {
                    console.log("New value root does not match", toPaddedHex(BigInt(newSubTreeRoot)), toPaddedHex(BigInt(this.globalValueTree.root)))
                }

                // The dual tree leaf is the new value tree root
                this.globalDualTree.insert(toPaddedHex(BigInt(newValueRoot)))
                if (toPaddedHex(BigInt(newDualRoot)) != toPaddedHex(BigInt(this.globalDualTree.root))) {
                    console.log("New dual root does not match", toPaddedHex(BigInt(newDualRoot)), toPaddedHex(BigInt(this.globalDualTree.root)))
                }

                this.globalLeafTimestamps.set(newSubTreeRoot, timestamp)
                this.globalLeafBlockHashes.set(newSubTreeRoot, blockHash)
                this.globalLeafEntries.push({ root: newSubTreeRoot, timestamp, blockHash })
                await this.persistence.storeGlobalValueTreeLeaf(newSubTreeRoot.toString(), timestamp, blockHash)
                await this.persistence.storeGlobalDualTreeLeaf(toPaddedHex(BigInt(newValueRoot)))

                this.on_chain_publishing_state.processing_local_tree = -1
                this.on_chain_publishing_state.local_trees_to_process.shift()
                await this.persistence.setOnChainPublishingState(this.on_chain_publishing_state)
            }
        } catch (error) {
            console.error("Error processing dual global tree insert", error)
            await this.load_everything()
            await this.resyncGlobalTree()
            await this.processGlobalTreeInsert(true)
            process.exit(-1)
        }
    }

    async postData(data: HexString[]): Promise<[number, number, string]> {
        await this.postDataLock;
        let releaseLock: () => void;
        this.postDataLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });
        try {
            var hashedData = data.map(d => keccakTreeHasher(d, 0n))
            var inserted_at = this.merkleTree.elements.length;
            for (const leaf of hashedData) {
                await this.persistence.storeLocalTreeLeaf(
                    this.getGlobalTreeIndex() + this.on_chain_publishing_state.local_trees_to_process.length,
                    this.merkleTree.elements.length,
                    leaf
                )
                this.merkleTree.insert(leaf)
            }
            var signature = await signDataInsertRequestJWT(data, this.getGlobalTreeIndex(), inserted_at, this.signer)
            return [this.getGlobalTreeIndex(), inserted_at, signature];
        } finally {
            releaseLock!();
        }
    }

    async getLatestGlobalLeafProof(): Promise<DualLatestGlobalLeafProofResult> {
        const localTree = await this.persistence.getLocalTree(this.getGlobalTreeIndex() - 1)
        const rootKey = toPaddedHex(BigInt(localTree.root))
        const timestamp: number = this.globalLeafTimestamps.get(rootKey) || 0
        const blockHash: string = this.globalLeafBlockHashes.get(rootKey) || "0x0"
        const globalProof = this.globalValueTree.proof(
            keccakTreeHasher(BigInt(localTree.root), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash)))
        )
        const valueTreeRoot = toPaddedHex(BigInt(this.globalValueTree.root))
        const dualProof = this.globalDualTree.proof(valueTreeRoot)
        return { dualProof, globalProof, leafRoot: rootKey, timestamp: timestamp.toString(), globalIndex: this.getGlobalTreeIndex() - 1, blockHash }
    }

    async getProof(value: HexString, from: number = 0): Promise<DualProofResult> {
        const occurrence = await this.selectOccurrence(value, from)
        if (!occurrence) {
            throw new Error(from > 0
                ? `Not provable: ${value} has no publication anchored at or after ${from}`
                : "Not provable")
        }
        const { globalIndex, localIndex, entry } = occurrence
        const localTree = await this.persistence.getLocalTree(globalIndex)
        const localProof = localTree.path(localIndex)
        // Timestamp and block hash come from the anchoring round itself, so they describe the
        // publication that was selected rather than whichever round happens to share its subtree root.
        const timestamp: string = entry.timestamp.toString()
        const blockHash: string = entry.blockHash

        const globalProof = this.globalValueTree.proof(
            keccakTreeHasher(BigInt(localTree.root), keccakTreeHasher(BigInt(timestamp), BigInt(blockHash)))
        )

        const dualLeafValue = this.globalDualTree.elements[globalIndex]
        const dualProof = this.globalDualTree.proof(dualLeafValue)

        return {
            dualProof,
            globalProof,
            localProof,
            timestamp,
            globalIndex,
            localIndex,
            blockHash,
            dualLeafValue: toPaddedHex(BigInt(dualLeafValue.toString())),
        }
    }
}
