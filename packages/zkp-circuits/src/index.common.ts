// export * from './circuit-wrapper';
// export * from './types/circuit_wrapper';
// import { WrappedNoirCircuit } from './circuit-wrapper';
// import type { mimc_testInputType } from './tscircuits/mimc_test';
// import type { top_level_merkle_proofInputType } from './tscircuits/top_level_merkle_proof';
// import type { sub_tree_merkle_proofInputType } from './tscircuits/sub_tree_merkle_proof';
// import type { generic_tree_proofInputType } from './tscircuits/generic_tree_proof';
// import topLevelMerkleProofJson from './tscircuits/top_level_merkle_proof/top_level_merkle_proof.json';
// import genericTreeProofJson from './tscircuits/generic_tree_proof/generic_tree_proof.json';
// import encryptProofJson from './tscircuits/encrypt_proof/encrypt_proof.json';
// import validatedSigHeAddJson from './tscircuits/validated_sig_he_add/validated_sig_he_add.json';
// import genericAdjacentTreeProofJson from './tscircuits/generic_adjacent_tree_proof/generic_adjacent_tree_proof.json';
import { WrappedCircomCircuit } from './circom-wrapper';
import type { IPFSConfig } from './circom-wrapper';
import openingProofIPFS from './ipfsrefs/opening_proof.json';
import hashTieIPFS from './ipfsrefs/hash_tie.json';

// Create IPFS configuration for opening_proof circuit
const openingProofIPFSConfig: IPFSConfig = {
  gateway: 'https://amethyst-hollow-lungfish-86.mypinata.cloud',
  circuitName: openingProofIPFS.circuitName,
  files: openingProofIPFS.files
};

// Create IPFS configuration for hash_tie circuit
const hashTieIPFSConfig: IPFSConfig = {
  gateway: 'https://amethyst-hollow-lungfish-86.mypinata.cloud',
  circuitName: hashTieIPFS.circuitName,
  files: hashTieIPFS.files
};

export const circomOpeningProof = WrappedCircomCircuit.fromIPFS(openingProofIPFSConfig);
export const circomHashTie = WrappedCircomCircuit.fromIPFS(hashTieIPFSConfig);
//var topLevelMerkleProofJson = JSON.parse(JSON.stringify(topLevelMerkleProofJson2));
//export const mimcTest = require('./tscircuits/mimc_test/mimc_test.json');
// import mimcTest from './tscircuits/mimc_test/mimc_test.json';
// import subTreeMerkleProofJson from './tscircuits/sub_tree_merkle_proof/sub_tree_merkle_proof.json';
// import type { encrypt_proofInputType } from './tscircuits/encrypt_proof';
// import type { validated_sig_he_addInputType } from './tscircuits/validated_sig_he_add';
// export const mimcTestCircuit = new WrappedNoirCircuit<mimc_testInputType>(mimcTest as any);
// export const topLevelMerkleTreeCircuit = new WrappedNoirCircuit<top_level_merkle_proofInputType>(topLevelMerkleProofJson as any);
// export const subTreeMerkleTreeCircuit = new WrappedNoirCircuit<sub_tree_merkle_proofInputType>(subTreeMerkleProofJson as any);
// export const genericTreeProofCircuit = new WrappedNoirCircuit<generic_tree_proofInputType>(genericTreeProofJson as any);
// export const encryptProofCircuit = new WrappedNoirCircuit<encrypt_proofInputType>(encryptProofJson as any);
// export const validatedSigHeAddCircuit = new WrappedNoirCircuit<validated_sig_he_addInputType>(validatedSigHeAddJson as any);
// export const genericAdjacentTreeProofCircuit = new WrappedNoirCircuit<generic_adjacent_tree_proofInputType>(genericAdjacentTreeProofJson as any);

import * as cryptoTools from "./utils/tools";
import { precompute } from "./utils/precompute";
import {
    deriveHEKeyScalar,
    deriveHEPublicKey,
    deriveSigningKeyScalar,
    deriveSigningPublicKey,
    normalizeSigningKeyMaterial,
    hexToSkBuffer,
} from "./utils/tools";
// Combinatorial-threshold encryption (search-width m variant). Exposed on the package entry so the
// client SDK consumes it without a forbidden deep import.
import { FDTEncrypt, FDTDecrypt } from "./utils/dte_hard";
import type { FDTSealedPackage, CombinationSeal, EccCiphertext } from "./utils/dte_hard";
// import * as decodeCypherText from "./utils/decode";
//import * as ec from "./ecelgamal";
//import type { generic_adjacent_tree_proofInputType } from './tscircuits/generic_adjacent_tree_proof';


export {
    // mimc_testInputType,
    // top_level_merkle_proofInputType,
    // sub_tree_merkle_proofInputType,
    // generic_tree_proofInputType,
    // encrypt_proofInputType,
    // validated_sig_he_addInputType,
    // generic_adjacent_tree_proofInputType,
    cryptoTools,
    WrappedCircomCircuit,
    IPFSConfig,
    precompute,
    FDTEncrypt,
    FDTDecrypt,
    FDTSealedPackage,
    CombinationSeal,
    EccCiphertext,
    // Canonical key-derivation helpers (used by @nihilium/registry)
    deriveHEKeyScalar,
    deriveHEPublicKey,
    deriveSigningKeyScalar,
    deriveSigningPublicKey,
    normalizeSigningKeyMaterial,
    hexToSkBuffer,
}