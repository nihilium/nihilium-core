


use noir_edwards::ScalarField;

use noir_edwards::bjj::{BabyJubJub};
use lib::encrypt::{Encode, Encypt};
use lib::constants::{powers_of_two, BASE_POINT, IDENTITY_POINT};

use noir_edwards::CurveTrait;

#[export]
pub fn main(
    privateKeyScalar: Field,
    publicKey: BabyJubJub,
    nonceKey_p: [Field; 8],
) -> pub (
    BabyJubJub,      // Generated Public Key
    [BabyJubJub; 8], // Point HE
    [BabyJubJub; 8], // Ephemeral Key HE
) {

    // Constrain the private key scalar size to 248 bits
    privateKeyScalar.assert_max_bit_size::<248>();

    // Convert the private key scalar to bits
    let bits: [u1; 248] = privateKeyScalar.to_le_bits();
    
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

    // Initialize the point_p and ephemeralKey_p arrays
    let mut point_p: [BabyJubJub; 8] = [IDENTITY_POINT; 8];
    let mut ephemeralKey_p: [BabyJubJub; 8] = [IDENTITY_POINT; 8];

    // Encrypt the message using the nonce keys
    for i in 0..8 {
        let encrypt_result = Encypt(
            Encode(message_p_31bit[i]),
            nonceKey_p[i],
            publicKey
        );

        point_p[i] = encrypt_result.0;
        ephemeralKey_p[i] = encrypt_result.1;
    }

    let scalar: ScalarField<64> = ScalarField::from(privateKeyScalar);
    let generatedPublicKeyOutput: BabyJubJub = BASE_POINT.mul(scalar);

    (
        generatedPublicKeyOutput,
        point_p,
        ephemeralKey_p
    )
}
