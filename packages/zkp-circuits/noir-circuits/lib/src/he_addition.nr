use noir_edwards::bjj::{BabyJubJub};
use crate::encrypt::{Encode, Encypt};
use crate::constants::{powers_of_two, IDENTITY_POINT};

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