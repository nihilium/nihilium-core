pragma circom 2.1.2;

include "./he_addition_param.circom";
include "../../../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/poseidon.circom";

template NihiliumCore(bits_per_chunk, num_chunks) {
    // Signature public key
    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;

    // HE public key and nonce
    signal input publicKey[2];
    signal input nonceKey_add[num_chunks];

    // Original ciphertexts (flattened [x0,y0,x1,y1,...])
    signal input point_org[num_chunks * 2];
    signal input ephemeralKey_org[num_chunks * 2];

    // Commitment and metadata
    signal input severed_commit_preimage;
    signal input severed_random_value;
    signal input unseal_condition_root;
    signal input input_add; // Value to add, max 248 bits
    signal input metadata_root;
    signal input corresponding_public_key[2];

    // Outputs
    signal output reveal_value;
    signal output unseal_condition_root_commit;
    signal output metadata_root_hash;
    // signal point_he[16];
    // signal ephemeralKey_he[16];
    signal output hashedEphemeralKeys;
    signal output hashedPoints;
    signal output publicKey_validated[2];
    signal output publicKeyHe_validated[2];
    signal output newCombinedPublicKey[2];

    // Hash point_org and ephemeralKey_org with Poseidon(16)
    
    component poseidonPoint = Poseidon(num_chunks * 2);
    poseidonPoint.inputs <== point_org;
    component poseidonEphemeral = Poseidon(num_chunks * 2);
    poseidonEphemeral.inputs <== ephemeralKey_org;

    // Hash severed_commit_preimage with Poseidon(1)
    component poseidonSeveredCommit = Poseidon(1);
    poseidonSeveredCommit.inputs <== [severed_commit_preimage];

    // Hash for metadata_root (Poseidon(1))
    component poseidonMetadataRoot = Poseidon(1);
    poseidonMetadataRoot.inputs <== [metadata_root];

    // Hash for metadata_root_commit = Poseidon([metadata_root, severed_commit_preimage])
    component poseidonMetadataRootCommit = Poseidon(2);
    poseidonMetadataRootCommit.inputs <== [metadata_root, severed_commit_preimage];

    // Hash for unseal_condition_root_commit = Poseidon([unseal_condition_root, poseidonSeveredCommit.out])
    component poseidonUnsealConditionRootCommit = Poseidon(2);
    poseidonUnsealConditionRootCommit.inputs <== [unseal_condition_root, poseidonSeveredCommit.out];

    // Compose the message for signature verification (Poseidon(8))
    component poseidonCombined = Poseidon(8);
    poseidonCombined.inputs <== [
        poseidonPoint.out,
        poseidonEphemeral.out,
        corresponding_public_key[0],
        corresponding_public_key[1],
        poseidonSeveredCommit.out,
        poseidonMetadataRootCommit.out,
        poseidonUnsealConditionRootCommit.out,
        severed_random_value
    ];

    // EdDSA signature verification
    component verify = EdDSAPoseidonVerifier();
    verify.enabled <== 1;
    verify.Ax <== Ax;
    verify.Ay <== Ay;
    verify.S <== S;
    verify.R8x <== R8x;
    verify.R8y <== R8y;
    verify.M <== poseidonCombined.out;

    // Homomorphic addition
    var he_input = input_add + metadata_root;
    component he_add = HomomorphicAddParam(bits_per_chunk, num_chunks);
    he_add.input_add <== he_input;
    he_add.publicKey <== publicKey;
    he_add.nonceKey_add <== nonceKey_add;
    he_add.point_org <== point_org;
    he_add.ephemeralKey_org <== ephemeralKey_org;

    // Compute reveal_value = Poseidon([severed_commit_preimage, severed_random_value])
    component reveal_value_hash = Poseidon(2);
    reveal_value_hash.inputs <== [severed_commit_preimage, severed_random_value];
    reveal_value <== reveal_value_hash.out;

    // unseal_condition_root_commit = unseal_condition_root (Noir returns this directly)
    unseal_condition_root_commit <== unseal_condition_root;

    // metadata_root_hash = Poseidon([metadata_root])
    metadata_root_hash <== poseidonMetadataRoot.out;

    // Compute generatedPublicKey = input_add * BabyJubJub.Base
    component generatePublicKey = BabyPbk();
    generatePublicKey.in <== input_add;
    signal generatedPublicKey[2];
    generatedPublicKey[0] <== generatePublicKey.Ax;
    generatedPublicKey[1] <== generatePublicKey.Ay;

    // newCombinedPublicKey = corresponding_public_key + generatedPublicKey
    component combinedPublicKey = BabyAdd();
    combinedPublicKey.x1 <== corresponding_public_key[0];
    combinedPublicKey.y1 <== corresponding_public_key[1];
    combinedPublicKey.x2 <== generatedPublicKey[0];
    combinedPublicKey.y2 <== generatedPublicKey[1];
    newCombinedPublicKey[0] <== combinedPublicKey.xout;
    newCombinedPublicKey[1] <== combinedPublicKey.yout;

    // Outputs for HE addition
    

    component hashedEphemeralKey = Poseidon(num_chunks * 2);
    hashedEphemeralKey.inputs <== he_add.ephemeralKey_he;
    component hashedPoint = Poseidon(num_chunks * 2);
    hashedPoint.inputs <== he_add.point_he;
    hashedEphemeralKeys <== hashedEphemeralKey.out;
    hashedPoints <== hashedPoint.out;
    // Output validated public keys
    publicKey_validated[0] <== Ax;
    publicKey_validated[1] <== Ay;
    publicKeyHe_validated[0] <== publicKey[0];
    publicKeyHe_validated[1] <== publicKey[1];
}