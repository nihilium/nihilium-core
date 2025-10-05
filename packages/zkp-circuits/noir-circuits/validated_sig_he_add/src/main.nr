


// use noir_edwards::ScalarField;
// use noir_edwards::bjj::{BabyJubJub};
// use lib::encrypt::{Encode, Encypt};
// use lib::constants::{powers_of_two, BASE_POINT, IDENTITY_POINT};




use eddsa::eddsa_verify;
use noir_edwards::ScalarField;
use noir_edwards::bjj::BabyJubJub;
//use lib::constants::{BASE_POINT};
use poseidon::poseidon::PoseidonHasher;
//use lib::he_addition::{HomomorphicAdd};
use poseidon::poseidon::bn254::{hash_1, hash_2, hash_8, hash_16};
use noir_edwards::CurveTrait;



pub global BASE_POINT: BabyJubJub = BabyJubJub {
        x: 5299619240641551281634865583518297030282874472190772894086521144482721001553,
        y: 16950150798460657717958625567821834550301663161624707787222815936182638968203,
};

pub global GENERATOR_POINT: BabyJubJub = BabyJubJub {
        x: 995203441582195749578291179787384436505546430278305826713579947235728471134,
        y: 5472060717959818805561601436314318772137091100104008585924551046643952123905,
};

pub global IDENTITY_POINT: BabyJubJub = BabyJubJub {
        x: 0,
        y: 1,
};

// Precomputed powers of two for 31 bits
pub global powers_of_two: [Field; 31] = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x0100, 0x0200, 0x0400, 0x0800, 0x1000, 0x2000, 0x4000, 0x8000, 0x010000, 0x020000, 0x040000, 0x080000, 0x100000, 0x200000, 0x400000, 0x800000, 0x01000000, 0x02000000, 0x04000000, 0x08000000, 0x10000000, 0x20000000, 0x40000000];


pub fn Encode(
    plaintext: Field
) -> BabyJubJub {
    // Limit the size of the input to 31 bits
    let scalar_f: ScalarField<32> = ScalarField::from(plaintext);
    let result: BabyJubJub = BASE_POINT.mul(scalar_f);
    result    
}

pub fn Encypt(
    message: BabyJubJub,
    nonceKey: Field,
    publicKey: BabyJubJub
) -> (
    BabyJubJub,    // Encrypted Message
    BabyJubJub,    // Ephemeral Key
) {

    // 
    assert(publicKey.x != IDENTITY_POINT.x);
    assert(publicKey.y != IDENTITY_POINT.y);

    assert(publicKey.is_on_curve());
    assert(message.is_on_curve());

    let scalar_f: ScalarField<63> = ScalarField::from(nonceKey);
    let ephemeralKey: BabyJubJub = BASE_POINT.mul(scalar_f);
    let encryptedMessage: BabyJubJub = message + publicKey.mul(scalar_f);
    (encryptedMessage, ephemeralKey)
}

pub fn HomomorphicAdd(
    input_add: Field,
    publicKey: BabyJubJub,
    nonceKey_add: [Field; 8],
    point_org: [BabyJubJub; 8],
    ephemeralKey_org: [BabyJubJub; 8],    
) -> (
    [BabyJubJub; 8], // Ephemeral Key HE
    [BabyJubJub; 8], // Point HE
) {
    
    // Constrain the private key scalar size to 248 bits
    input_add.assert_max_bit_size::<248>();

    // Convert the private key scalar to bits
    let bits: [u1; 248] = input_add.to_le_bits();

    // Initialize the message_p_31bit array
    let mut message_p_31bit: [Field; 8] = [0; 8];

    // Convert the bits to 31-bit numbers
    for i in 0..8 {
        let mut acc: Field = 0;
        for j in 0..31 {
            acc += (bits[i * 31 + j] as Field) * powers_of_two[j];
        }
        message_p_31bit[i] = acc;
    }

    // Initialize the point_add and ephemeralKey_add arrays
    let mut point_add: [BabyJubJub; 8] = [IDENTITY_POINT; 8];
    let mut ephemeralKey_add: [BabyJubJub; 8] = [IDENTITY_POINT; 8];

    for i in 0..8 {
        let encrypt_result = Encypt(
            Encode(message_p_31bit[i]),
            nonceKey_add[i],
            publicKey
        );

        ephemeralKey_add[i] = encrypt_result.1;
        point_add[i] = encrypt_result.0;
    }

    // Initialize the point_he and ephemeralKey_he arrays
    let mut point_he: [BabyJubJub; 8] = [IDENTITY_POINT; 8];
    let mut ephemeralKey_he: [BabyJubJub; 8] = [IDENTITY_POINT; 8];

    for i in 0..8 {
        point_he[i] = point_add[i] + point_org[i];
        ephemeralKey_he[i] = ephemeralKey_add[i] + ephemeralKey_org[i];
    }

    (point_he, ephemeralKey_he)
}
#[export]
pub fn main(
    A: BabyJubJub, // Signature public Key
    S: Field,
    R8x: Field,
    R8y: Field,
    publicKey: BabyJubJub, //HE Public key
    nonceKey: [Field; 8],
    point_org: [BabyJubJub; 8],
    ephemeralKey_org: [BabyJubJub; 8],
    severed_commit_preimage: Field,
    severed_random_value: Field,
    unseal_condition_root: Field,
    input_add: Field,
    metadata_root: Field,
    corresponding_public_key: BabyJubJub,
) -> pub (
    Field,           // Reveal Value
    Field,           // Unseal Condition Root Commit
    Field,           // Metadata Root Hash
    [BabyJubJub; 8], // Point HE
    [BabyJubJub; 8], // Ephemeral Key HE
    BabyJubJub,      // Public Key Validated
    BabyJubJub,      // Public Key HE Validated
    BabyJubJub,      // New Combined Public Key,
   
   
) {
    // signal output reveal_value;
    // signal output unseal_condition_root_commit;
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
    
    let unseal_condition_root_commit: Field = hash_2([unseal_condition_root, poseidonSeveredCommit]);

    let metadata_root_commit: Field = hash_2([metadata_root, severed_commit_preimage]);

    let poseidonCombined: Field = hash_8([
        poseidonPoint,
        poseidonEphemeral,
        corresponding_public_key.x,
        corresponding_public_key.y,
        poseidonSeveredCommit,
        metadata_root_commit,
        unseal_condition_root_commit,
        severed_random_value,
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
        input_add + metadata_root, 
        publicKey,
        nonceKey,
        point_org,
        ephemeralKey_org,
    );

    let input_add_scalar: ScalarField<64> = ScalarField::from(input_add);
    let generatedPublicKey: BabyJubJub = BASE_POINT.mul(input_add_scalar);

    let reveal_value: Field = hash_2([severed_commit_preimage, severed_random_value]);

    let combinedPublicKey: BabyJubJub = corresponding_public_key + generatedPublicKey;
    let metadata_root_hash: Field = hash_1([metadata_root]);
    (
        reveal_value,
        unseal_condition_root,
        metadata_root_hash,
        homomorphic_add_result.0,
        homomorphic_add_result.1,
        A,
        publicKey,
        combinedPublicKey,
        
      
    )
}