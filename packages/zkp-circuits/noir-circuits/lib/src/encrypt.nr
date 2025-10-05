use noir_edwards::ScalarField;
use noir_edwards::bjj::{BabyJubJub};
use crate::constants::{IDENTITY_POINT, BASE_POINT};
use noir_edwards::CurveTrait;

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