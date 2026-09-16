#!/usr/bin/env node
/**
 * zkpassport_verifiers -- inspect and sync the ZKPassport verifier routing table.
 *
 * ZKPassportProof routes a disclosure proof to the Honk verifier ZKPassport deployed for that
 * circuit, using a `vkeyHash -> verifier` mapping it LEARNS ONCE and then holds permanently
 * (see contracts/proofs/LearnedCallProxy.sol for why it is not read live). Learning is a
 * transaction, and nothing in deploy_static.ts performs it -- a freshly deployed ZKPassportProof
 * knows zero circuits, and `verify` returns false for all of them. This script is that step.
 *
 *   node scripts/zkpassport_verifiers.mjs upstream   # what ZKPassport currently publishes
 *   node scripts/zkpassport_verifiers.mjs status     # ^ diffed against our deployed contract
 *   node scripts/zkpassport_verifiers.mjs sync       # dry run of the learnVerifier calls
 *   node scripts/zkpassport_verifiers.mjs sync --apply   # actually send them (needs PRIVATE_KEY)
 *
 * Options:
 *   --rpc <url>     JSON-RPC endpoint      (default: $SEPOLIA_RPC_URL, else the hardhat default)
 *   --chain <id>    chain id               (default: 11155111)
 *   --proxy <addr>  our ZKPassportProof    (default: looked up in deployed-contracts-<chain>.json)
 *   --root <addr>   ZKPassport root        (default: known_deployed_contracts-<chain>.json)
 *   --max-major/--max-minor/--max-patch    version scan bounds (default 1 / 40 / 8)
 *   --json          machine-readable output
 *
 * ------------------------------------------------------------------------------------------
 * HOW ENUMERATION WORKS, AND WHY IT LOOKS LIKE THIS
 *
 * Neither upstream contract can be listed through a getter. The root verifier exposes only
 * getSubVerifier(version), and the SubVerifier's `vkeyHash -> verifier` getter is an unnamed
 * function reached by raw selector (0x1e8e0f8e) -- its source is unverified, and a brute force
 * over ~24k plausible signatures found no enumerator on it. So discovery is two stages:
 *
 *   1. VERSIONS: probe getSubVerifier() across a bounded semver grid. Versions are sparse
 *      (0.14.1, 0.15.0, 0.15.1, 0.16.0, 0.17.1, 0.18.0, ...) and several share one SubVerifier.
 *
 *   2. VKEY HASHES: scan each SubVerifier's registration event. Its topic0 is recorded below as
 *      an opaque constant -- the ABI is not published, so the name could not be recovered, but
 *      the payload was cross-checked against the raw getter for every entry and agreed on all of
 *      them. The event is HISTORY, so every hit is then re-read through the getter: an entry the
 *      admin has since removed comes back as the zero address and is reported retired, not new.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The SubVerifier's unnamed `vkeyHash -> verifier` getter. Same selector ZKPassportProof uses. */
const SUB_LOOKUP_SELECTOR = "0x1e8e0f8e";

/**
 * topic0 of the SubVerifier's registration event: (verifier indexed, vkeyHash indexed).
 * Opaque on purpose -- see the header. Treat a change here as "ZKPassport redeployed their
 * registry", not as a bug: the script reports zero circuits rather than silently syncing nothing,
 * because `upstream` warns when a SubVerifier yields no events.
 */
const REGISTERED_TOPIC = "0x220dc8943553a5812167948533c5a3a0c0674c926e0aea0f6b0a8cf5701044b4";

const ROOT_ABI = ["function getSubVerifier(bytes32) view returns (address)"];
const PROXY_ABI = [
    "function verifiers(bytes32) view returns (address)",
    "function versionOf(bytes32) view returns (bytes32)",
    "function bannedAt(bytes32) view returns (uint64)",
    "function rootVerifier() view returns (address)",
    "function learnVerifier(bytes32 version, bytes32 vkeyHash)",
];

// ---------------------------------------------------------------------------------- arg parsing

const argv = process.argv.slice(2);
const command = (argv[0] && !argv[0].startsWith("--")) ? argv.shift() : "status";
const flag = (name, fallback = undefined) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const CHAIN = Number(flag("chain", "11155111"));
const RPC = flag("rpc", process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.ethpandaops.io");
const JSON_OUT = has("json");
const APPLY = has("apply");
const BOUNDS = {
    major: Number(flag("max-major", "1")),
    minor: Number(flag("max-minor", "40")),
    patch: Number(flag("max-patch", "8")),
};

/** ZKPassport's version encoding: 3 x uint16 big-endian, right-padded to bytes32. */
const versionKey = (major, minor, patch) =>
    "0x" + [major, minor, patch].map((n) => n.toString(16).padStart(4, "0")).join("").padEnd(64, "0");

const readJson = (file) => {
    const p = path.join(HERE, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

const log = (...a) => { if (!JSON_OUT) console.log(...a); };

// ------------------------------------------------------------------------------------ discovery

/** Probe the semver grid for versions the root verifier knows. Returns [{version, subVerifier}]. */
async function discoverVersions(root) {
    const candidates = [];
    for (let a = 0; a <= BOUNDS.major; a++)
        for (let b = 0; b <= BOUNDS.minor; b++)
            for (let c = 0; c <= BOUNDS.patch; c++) candidates.push([a, b, c]);

    log(`scanning ${candidates.length} version keys on the root verifier...`);
    const found = [];
    const CHUNK = 50;   // keep public RPCs happy; these are plain eth_calls
    for (let i = 0; i < candidates.length; i += CHUNK) {
        const results = await Promise.all(candidates.slice(i, i + CHUNK).map(async ([a, b, c]) => {
            try {
                return { v: `${a}.${b}.${c}`, key: versionKey(a, b, c),
                         sub: await root.getSubVerifier(versionKey(a, b, c)) };
            } catch {
                return null;   // a transient RPC failure must not look like "no such version"
            }
        }));
        for (const r of results) {
            if (r && r.sub && r.sub !== ethers.ZeroAddress) {
                found.push({ version: r.v, versionKey: r.key, subVerifier: r.sub });
            }
        }
    }
    return found;
}

/**
 * Every vkeyHash a SubVerifier still holds, read from its registration events and then confirmed
 * through the getter. Returns a Map of vkeyHash -> { verifier, retired }.
 */
async function readSubVerifier(provider, subVerifier) {
    const logs = await provider.getLogs({
        address: subVerifier, topics: [REGISTERED_TOPIC], fromBlock: 0, toBlock: "latest",
    });
    const entries = new Map();
    for (const entry of logs) {
        const vkeyHash = entry.topics[2];
        // The event is history; the getter is current state. Removal upstream shows up here.
        const ret = await provider.call({
            to: subVerifier, data: SUB_LOOKUP_SELECTOR + vkeyHash.slice(2),
        });
        const current = ret.length >= 66
            ? ethers.getAddress("0x" + ret.slice(26, 66)) : ethers.ZeroAddress;
        entries.set(vkeyHash, {
            verifier: current,
            announced: ethers.getAddress("0x" + entry.topics[1].slice(26)),
            retired: current === ethers.ZeroAddress,
        });
    }
    return entries;
}

/**
 * The full upstream picture: one row per vkeyHash, carrying the version to learn it under.
 *
 * Where several versions share a SubVerifier, the NEWEST is chosen deliberately.
 * ZKPassportProof.recordBan re-reads getSubVerifier(versionOf[vkeyHash]) to decide whether a
 * circuit was retired, so pinning a hash to the oldest version that happens to expose it would let
 * anyone record a ban the moment that old version is dropped -- while the same circuit is still
 * current under a newer one. Newest-wins makes the ban check track the circuit's real lifetime.
 */
async function buildUpstream(provider, root) {
    const versions = await discoverVersions(root);
    if (versions.length === 0) throw new Error("No versions found on the root verifier -- wrong address or chain?");

    const bySub = new Map();
    for (const v of versions) {
        if (!bySub.has(v.subVerifier)) bySub.set(v.subVerifier, []);
        bySub.get(v.subVerifier).push(v);
    }
    const cmp = (x, y) => {
        const [a, b, c] = x.version.split(".").map(Number), [d, e, f] = y.version.split(".").map(Number);
        return a - d || b - e || c - f;
    };

    const rows = [];
    for (const [sub, vs] of bySub) {
        const newest = vs.slice().sort(cmp).at(-1);
        const entries = await readSubVerifier(provider, sub);
        if (entries.size === 0) {
            log(`  ! ${sub} published no registration events -- ZKPassport may have changed their registry`);
        }
        for (const [vkeyHash, info] of entries) {
            rows.push({
                vkeyHash,
                verifier: info.verifier,
                retired: info.retired,
                subVerifier: sub,
                version: newest.version,
                versionKey: newest.versionKey,
                versionsSharing: vs.map((v) => v.version),
            });
        }
    }
    return { versions, rows };
}

// -------------------------------------------------------------------------------- our side

function resolveProxyAddress() {
    const override = flag("proxy");
    if (override) return override;
    const deployed = readJson(`deployed-contracts-${CHAIN}.json`);
    for (const key of ["ZKPassportProof", "ZKPassportAgeProof", "ZKPassportBirthdateProof"]) {
        if (deployed?.[key]?.address) return deployed[key].address;
    }
    return null;
}

function resolveRootAddress() {
    const override = flag("root");
    if (override) return override;
    const known = readJson(`known_deployed_contracts-${CHAIN}.json`);
    return known?.zkpassport_root_verifier ?? null;
}

/** Classify each upstream row against what our contract already holds. */
async function diff(proxy, rows) {
    const out = [];
    for (const row of rows) {
        const [ours, versionOf, banned] = await Promise.all([
            proxy.verifiers(row.vkeyHash),
            proxy.versionOf(row.vkeyHash),
            proxy.bannedAt(row.vkeyHash),
        ]);
        const learned = ours !== ethers.ZeroAddress;
        let state;
        if (banned > 0n) state = "BANNED";                       // ban already stamped
        else if (!learned && row.retired) state = "SKIP";        // gone upstream, never learned
        else if (!learned) state = "NEW";                        // the ones sync will learn
        else if (row.retired) state = "RETIRED";                 // learned, dropped upstream
        else if (ours !== row.verifier) state = "DRIFT";         // we hold a different address
        else state = "SYNCED";
        out.push({ ...row, ours: learned ? ours : null, versionOf, banned: banned.toString(), state });
    }
    return out;
}

// ------------------------------------------------------------------------------------ rendering

const STATE_NOTE = {
    NEW: "not in our contract -- `sync --apply` will learn it",
    SYNCED: "already registered, address matches upstream",
    DRIFT: "registered, but upstream now names a different verifier (ours is permanent by design)",
    RETIRED: "registered here, removed upstream -- candidate for recordBan()",
    BANNED: "a ban is already stamped; proofs dated at/after it stop verifying",
    SKIP: "removed upstream and never learned here -- nothing to do",
};

function render(rows, versions, proxyAddress) {
    log(`\nversions on the root verifier (${versions.length}):`);
    for (const v of versions) log(`  ${v.version.padEnd(8)} -> ${v.subVerifier}`);

    log(`\ncircuits (${rows.length}):`);
    for (const r of rows) {
        const mark = { NEW: "+", SYNCED: "=", DRIFT: "~", RETIRED: "-", BANNED: "x", SKIP: " " }[r.state];
        log(`  ${mark} ${r.state.padEnd(8)} ${r.vkeyHash}`);
        log(`      verifier ${r.verifier}   learn under ${r.version}` +
            (r.versionsSharing.length > 1 ? `  (shared: ${r.versionsSharing.join(", ")})` : ""));
    }

    const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] || 0) + 1 }), {});
    log(`\nsummary${proxyAddress ? ` for ${proxyAddress}` : ""}:`);
    for (const [state, n] of Object.entries(counts)) log(`  ${String(n).padStart(3)} ${state.padEnd(8)} ${STATE_NOTE[state]}`);
    return counts;
}

// ---------------------------------------------------------------------------------------- main

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: true });
    const rootAddress = resolveRootAddress();
    if (!rootAddress) throw new Error(`No zkpassport_root_verifier in known_deployed_contracts-${CHAIN}.json; pass --root`);

    log(`chain ${CHAIN} via ${RPC}`);
    log(`root verifier ${rootAddress}`);
    if ((await provider.getCode(rootAddress)) === "0x") {
        throw new Error(`No ZKPassport root verifier deployed at ${rootAddress} on chain ${CHAIN}`);
    }

    const root = new ethers.Contract(rootAddress, ROOT_ABI, provider);
    const { versions, rows } = await buildUpstream(provider, root);

    if (command === "upstream") {
        if (JSON_OUT) console.log(JSON.stringify({ versions, circuits: rows }, null, 2));
        else {
            log(`\nversions on the root verifier (${versions.length}):`);
            for (const v of versions) log(`  ${v.version.padEnd(8)} -> ${v.subVerifier}`);
            log(`\ncircuits upstream (${rows.length}):`);
            for (const r of rows) log(`  ${r.retired ? "retired" : "current"}  ${r.vkeyHash}  -> ${r.verifier}  @${r.version}`);
        }
        return;
    }

    // status and sync both need our contract.
    const proxyAddress = resolveProxyAddress();
    if (!proxyAddress) {
        log(`\nZKPassportProof is NOT deployed on chain ${CHAIN}.`);
        log(`  deployed-contracts-${CHAIN}.json has no ZKPassportProof entry.`);
        log(`  Deploy it first (scripts/deploy_static.ts), then re-run -- or pass --proxy <address>.`);
        log(`\nUpstream has ${rows.length} circuits across ${versions.length} versions, all of which`);
        log(`would be NEW once the contract exists.`);
        if (JSON_OUT) console.log(JSON.stringify({ deployed: false, versions, circuits: rows }, null, 2));
        process.exitCode = 1;
        return;
    }
    if ((await provider.getCode(proxyAddress)) === "0x") {
        throw new Error(`No contract at ${proxyAddress} on chain ${CHAIN} -- stale deployed-contracts file?`);
    }
    log(`our ZKPassportProof ${proxyAddress}`);

    const proxy = new ethers.Contract(proxyAddress, PROXY_ABI, provider);
    // A proxy pointed at a different upstream would produce a meaningless diff.
    const wired = await proxy.rootVerifier();
    if (wired.toLowerCase() !== rootAddress.toLowerCase()) {
        throw new Error(`Our contract is wired to root ${wired}, not ${rootAddress}`);
    }

    const diffed = await diff(proxy, rows);

    if (command === "status") {
        if (JSON_OUT) console.log(JSON.stringify({ deployed: true, proxy: proxyAddress, versions, circuits: diffed }, null, 2));
        else render(diffed, versions, proxyAddress);
        return;
    }

    if (command !== "sync") throw new Error(`Unknown command "${command}" (upstream | status | sync)`);

    const todo = diffed.filter((r) => r.state === "NEW");
    render(diffed, versions, proxyAddress);

    if (todo.length === 0) { log(`\nNothing to learn -- every current upstream circuit is registered.`); return; }

    log(`\n${todo.length} learnVerifier call(s) to make:`);
    for (const r of todo) log(`  learnVerifier(${r.version}, ${r.vkeyHash})`);

    if (!APPLY) {
        log(`\nDry run. Re-run with --apply to send these transactions.`);
        return;
    }
    if (!process.env.PRIVATE_KEY) throw new Error("--apply needs PRIVATE_KEY in the environment");

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    log(`\nsending as ${wallet.address}`);
    const writable = proxy.connect(wallet);

    // Nonces are tracked here rather than left to the provider. Ethers caches the pending count
    // per block, and on a fast chain the next send in this loop can be assigned a nonce that the
    // previous one already used -- which surfaces as "nonce has already been used" on alternate
    // transactions. Only a send that actually goes out consumes one.
    let nonce = await provider.getTransactionCount(wallet.address, "pending");
    let ok = 0;
    for (const r of todo) {
        try {
            // staticCall first: learnVerifier reverts on "Already learned" / "Unknown upstream" /
            // "Verifier has no code". Checking before spending a nonce keeps one bad entry from
            // stranding the rest of the batch.
            await writable.learnVerifier.staticCall(r.versionKey, r.vkeyHash);
            const tx = await writable.learnVerifier(r.versionKey, r.vkeyHash, { nonce: nonce++ });
            log(`  ${r.vkeyHash.slice(0, 18)}... tx ${tx.hash}`);
            await tx.wait();
            ok++;
        } catch (e) {
            log(`  ${r.vkeyHash.slice(0, 18)}... FAILED: ${(e.shortMessage || e.message).slice(0, 120)}`);
        }
    }
    log(`\nlearned ${ok}/${todo.length}. Re-run \`status\` to confirm.`);
}

main().catch((e) => { console.error(`\nerror: ${e.message}`); process.exitCode = 1; });
