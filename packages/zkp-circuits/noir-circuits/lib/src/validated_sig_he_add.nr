use eddsa::eddsa_verify;
use noir_edwards::ScalarField;
use noir_edwards::bjj::BabyJubJub;
use crate::constants::{BASE_POINT};
use poseidon::poseidon::PoseidonHasher;
use crate::he_addition::{HomomorphicAdd};
use poseidon::poseidon::bn254::{hash_1, hash_5, hash_16};
use noir_edwards::CurveTrait;







pub fn ValidatedSigHEAdd(
    A: BabyJubJub,
    S: Field,
    R8x: Field,
    R8y: Field,
    publicKey: BabyJubJub,
    nonceKey: [Field; 8],
    point_org: [BabyJubJub; 8],
    ephemeralKey_org: [BabyJubJub; 8],
    severed_commit_preimage: Field,
    
    input_add: Field,
    corresponding_public_key: BabyJubJub,
    
    
) -> (
    [BabyJubJub; 8], // Ephemeral Key HE
    [BabyJubJub; 8], // Point HE
    BabyJubJub,      // Public Key Validated
    BabyJubJub,      // Public Key HE Validated
    BabyJubJub,      // New Combined Public Key
) {
    let mut point_org_poseidon: [Field; 16] = [0; 16];
    let mut ephemeralKey_org_poseidon: [Field; 16] = [0; 16];

    for i in 0..8 {
        point_org_poseidon[i * 2] = point_org[i].x;
        point_org_poseidon[i * 2 + 1] = point_org[i].y;
        ephemeralKey_org_poseidon[i * 2] = ephemeralKey_org[i].x;
        ephemeralKey_org_poseidon[i * 2 + 1] = ephemeralKey_org[i].y;
    }

    let poseidonPoint: Field = hash_16(point_org_poseidon);

    let poseidonEphemeral: Field = hash_16(ephemeralKey_org_poseidon);

    let poseidonSeveredCommit: Field = hash_1([severed_commit_preimage]);

    let poseidonCombined: Field = hash_5([
        poseidonPoint,
        poseidonEphemeral,
        corresponding_public_key.x,
        corresponding_public_key.y,
        poseidonSeveredCommit,
    ]);

    let verify: bool = eddsa_verify::<PoseidonHasher>(
        A.x,
        A.y,
        S,
        R8x,
        R8y,
        poseidonCombined,
    );

    assert(verify);

    let homomorphic_add_result: ([BabyJubJub; 8], [BabyJubJub; 8]) = HomomorphicAdd(
        input_add,
        publicKey,
        nonceKey,
        point_org,
        ephemeralKey_org,
    );

    let input_add_scalar: ScalarField<64> = ScalarField::from(input_add);
    let generatedPublicKey: BabyJubJub = BASE_POINT.mul(input_add_scalar);

    let combinedPublicKey: BabyJubJub = corresponding_public_key + generatedPublicKey;

    (
        homomorphic_add_result.1,
        homomorphic_add_result.0,
        A,
        publicKey,
        combinedPublicKey,
    )
}