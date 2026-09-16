/**
 * The static contract set, shared by deploy_static.ts and verify_static.ts.
 *
 * It lives in its own module for one reason: the two scripts used to keep private copies of this
 * list, so every contract added to the deploy silently went unverified until someone noticed.
 * verify_static.ts cannot simply import from deploy_static.ts -- that module ends in `main()` and
 * would deploy on import -- so the shared truth has to sit somewhere with no side effects. Adding
 * a contract HERE adds it to both.
 *
 * Nothing in this file may execute at import time.
 */

/** A contract with no constructor arguments. */
export type VerifierConfig = {
    /** Address-map key, and the key used in deployed-contracts-<chainId>.json. */
    name: string;
    /** Path inside artifacts/, without the .json suffix. Used for bytecode and ABI. */
    artifactPath: string;
    /** Hardhat fully-qualified name, "path/To.sol:ContractName". Used for verification. */
    contractPath: string;
};

/**
 * One constructor argument of a proxy, resolved at deploy time:
 *
 *   "SELECT:<name>"  an address deployed by this script (from VERIFIER_CONFIGS)
 *   "<name>"         an externally deployed address, from known_deployed_contracts-<chain>.json
 *   [ ...refs ]      an address[] argument, each element resolved the same way
 */
export type ProxyArgRef = string | string[];

/** A contract that routes to other verifiers and so takes addresses as constructor arguments. */
export type ProxyConfig = VerifierConfig & {
    args: ProxyArgRef[];
    /**
     * Extra address-map keys that resolve to this same deployment. StandardProofLibrary keys its
     * map by addressMapKey, so several proof descriptors sharing one verifier each need their own
     * key -- the ZKPassport age and birthdate descriptors are the same circuit and the same
     * contract, distinguished only by what their parameter commitment means.
     *
     * An alias is an extra NAME, never an extra deployment: verification skips aliases, because
     * the address is already covered by the canonical entry.
     */
    aliases?: string[];
};

export const VERIFIER_CONFIGS: VerifierConfig[] = [
    { name: "TopLevelMerkleProof", artifactPath: "contracts/proofs/TopLevelMerkleProof.sol/TopLevelMerkleProof", contractPath: "contracts/proofs/TopLevelMerkleProof.sol:TopLevelMerkleProof" },
    { name: "MerkleTreeProof", artifactPath: "contracts/proofs/MerkleTreeProof.sol/MerkleTreeProof", contractPath: "contracts/proofs/MerkleTreeProof.sol:MerkleTreeProof" },
    { name: "KeccakTreeEntry", artifactPath: "contracts/proofs/KeccakTreeEntry.sol/KeccakTreeEntry", contractPath: "contracts/proofs/KeccakTreeEntry.sol:KeccakTreeEntry" },
    { name: "GreaterOrEqualThen", artifactPath: "contracts/proofs/GreaterOrEqualThen.sol/GreaterOrEqualThen", contractPath: "contracts/proofs/GreaterOrEqualThen.sol:GreaterOrEqualThen" },
    { name: "SmallerThan", artifactPath: "contracts/proofs/SmallerThan.sol/SmallerThan", contractPath: "contracts/proofs/SmallerThan.sol:SmallerThan" },
    { name: "TimeDelayProof", artifactPath: "contracts/proofs/TimeDelayProof.sol/TimeDelayProof", contractPath: "contracts/proofs/TimeDelayProof.sol:TimeDelayProof" },
    { name: "VerifyEDDSA", artifactPath: "contracts/proofs/VerifyEDDSA.sol/VerifyEDDSA", contractPath: "contracts/proofs/VerifyEDDSA.sol:VerifyEDDSA" },
    { name: "VerifyECDSA", artifactPath: "contracts/proofs/VerifyECDSA.sol/VerifyECDSA", contractPath: "contracts/proofs/VerifyECDSA.sol:VerifyECDSA" },
    { name: "AdditionProof", artifactPath: "contracts/proofs/AdditionProof.sol/AdditionProof", contractPath: "contracts/proofs/AdditionProof.sol:AdditionProof" },
    { name: "ManualChoice", artifactPath: "contracts/proofs/ManualChoice.sol/ManualChoice", contractPath: "contracts/proofs/ManualChoice.sol:ManualChoice" },
    { name: "ValueInjection", artifactPath: "contracts/proofs/ValueInjection.sol/ValueInjection", contractPath: "contracts/proofs/ValueInjection.sol:ValueInjection" },
    { name: "Poseidon2Verifier", artifactPath: "contracts/proofs/Poseidon2.sol/Poseidon2Verifier", contractPath: "contracts/proofs/Poseidon2.sol:Poseidon2Verifier" },
    { name: "opening_proof", artifactPath: "contracts/proofs/opening_proof.sol/opening_proof", contractPath: "contracts/proofs/opening_proof.sol:opening_proof" },
    { name: "hash_tie", artifactPath: "contracts/proofs/hash_tie.sol/hash_tie", contractPath: "contracts/proofs/hash_tie.sol:hash_tie" },
    { name: "ZkPassportCustomDataFormatProof", artifactPath: "contracts/proofs/FormatBoundData.sol/FormatBoundData", contractPath: "contracts/proofs/FormatBoundData.sol:FormatBoundData" },
    // Retired or not yet in the set -- kept as a record of what was deliberately left out:
    // { name: "generic_adjacent_tree_proof", artifactPath: "contracts/generic_adjacent_tree_proof.sol/BaseHonkVerifier", contractPath: "contracts/generic_adjacent_tree_proof.sol:BaseHonkVerifier" },
    // { name: "generic_tree_proof", artifactPath: "contracts/generic_tree_proof.sol/BaseHonkVerifier", contractPath: "contracts/generic_tree_proof.sol:BaseHonkVerifier" },
    // { name: "sub_tree_merkle_proof", artifactPath: "contracts/decomissioned/sub_tree_merkle_proof.sol/sub_tree_merkle_proof", contractPath: "contracts/decomissioned/sub_tree_merkle_proof.sol:sub_tree_merkle_proof" },
    // { name: "top_level_merkle_proof", artifactPath: "contracts/decomissioned/top_level_merkle_proof.sol/top_level_merkle_proof", contractPath: "contracts/decomissioned/top_level_merkle_proof.sol:top_level_merkle_proof" },
    // { name: "zk_email_proof", artifactPath: "contracts/proofs/EmailSendVerifier.sol/email_send_no_body", contractPath: "contracts/proofs/EmailSendVerifier.sol:email_send_no_body" },
    // { name: "IsInListProof", artifactPath: "contracts/proofs/IsInList.sol/IsInListProof", contractPath: "contracts/proofs/IsInList.sol:IsInListProof" },
    // { name: "DynamicCallProxyProof", artifactPath: "contracts/proofs/DynamicCallProxy.sol/DynamicCallProxyProof", contractPath: "contracts/proofs/DynamicCallProxy.sol:DynamicCallProxyProof" },
];

/**
 * A proxy whose references are not known on a chain is skipped rather than deployed, so a chain
 * where the upstream does not exist ends up with no entry at all instead of a proxy that can never
 * work. Callers then fail at template compile time with "Address not found for proof X", which
 * names the actual problem.
 */
export const PROXY_CONFIGS: ProxyConfig[] = [
    {
        name: "ZKEmailProof",
        artifactPath: "contracts/proofs/ZKEmailProof.sol/ZKEmailProof",
        contractPath: "contracts/proofs/ZKEmailProof.sol:ZKEmailProof",
        args: [["zk_email_proof_1024", "zk_email_proof_2048"], "zk_email_registry"],
    },
    {
        name: "ZKPassportProof",
        artifactPath: "contracts/proofs/ZKPassportProof.sol/ZKPassportProof",
        contractPath: "contracts/proofs/ZKPassportProof.sol:ZKPassportProof",
        args: ["zkpassport_root_verifier"],
        aliases: ["ZKPassportAgeProof", "ZKPassportBirthdateProof"],
    },
];

/** Every alias name across all proxies -- the deployed-contracts keys that are not deployments. */
export const ALIAS_NAMES: ReadonlySet<string> = new Set(
    PROXY_CONFIGS.flatMap((config) => config.aliases ?? []),
);
