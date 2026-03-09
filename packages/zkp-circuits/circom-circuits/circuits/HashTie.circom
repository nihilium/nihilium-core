pragma circom 2.1.2;


include "../../../node_modules/circomlib/circuits/poseidon.circom";
template HashTie() {
    signal input tied_value_input;
    signal input pre_image;

    signal output tied_hash;
    signal output tied_value;
    component poseidonHash = Poseidon(1);
    poseidonHash.inputs <== [pre_image];

    tied_hash <== poseidonHash.out;
    tied_value <== tied_value_input;

}

