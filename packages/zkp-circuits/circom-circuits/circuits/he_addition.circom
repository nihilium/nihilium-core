pragma circom 2.1.2;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "./encrypt.circom";
include "../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom"; // For Num2Bits





template HomomorphicAdd() {

    //plaintext big number to add, 120 bits
    signal input input_add;
    //public key for encryption
    signal input publicKey[2];
    //nonce key for encryption
    signal input nonceKey_add[8];
    //TODO:signature validation & message_base validation


    //Original cihpertext from signature
    signal input point_org[16];    
    signal input ephemeralKey_org[16];

    //homomorphic addition
    signal output ephemeralKey_he[16];
    signal output point_he[16];

    //signal output hashed_input_add;
    
    signal message_add_31bit[8];
    signal ephemeralKey_add[16];
    signal point_add[16];
    component num2Bits;
   

    num2Bits = Num2Bits(248);
    num2Bits.in <== input_add;
    

    
    // Declare arrays to hold Bits2Num components
    component bits2num_add[8];
    
    for (var j = 0; j < 8; j++) {
        var startBit = j * 31;
        var nBits = 31;

        // if (j == 3) {
        //     // Handle the remainder bits for the last chunk
        //     nBits = 27; // Correctly set to 27 bits for the last chunk
        // }

        // Instantiate Bits2Num components with a fixed size of 31 bits
        bits2num_add[j] = Bits2Num(31);

        // Assign bits to the Bits2Num components
        for (var b = 0; b < nBits; b++) {
            bits2num_add[j].in[b] <== num2Bits.out[startBit + b];            
        }

        // Pad remaining bits with zeros for the last chunk
        if (nBits < 31) {
            for (var b = nBits; b < 31; b++) {
                bits2num_add[j].in[b] <== 0;
                
            }
        }

        message_add_31bit[j] <== bits2num_add[j].out;
    }

    
    component encrypt_add[8];
    component encodeMsg_add[8];
    for (var i=0; i<8; i++) {
        encrypt_add[i] = Encrypt();
        encodeMsg_add[i] = Encode();
        encodeMsg_add[i].plaintext <== message_add_31bit[i];
        encrypt_add[i].message <== encodeMsg_add[i].out;
        encrypt_add[i].nonceKey <== nonceKey_add[i];
        encrypt_add[i].publicKey <== publicKey;
        point_add[2*i] <== encrypt_add[i].encryptedMessage[0];
        point_add[2*i+1] <== encrypt_add[i].encryptedMessage[1];
        ephemeralKey_add[2*i] <== encrypt_add[i].ephemeralKey[0];
        ephemeralKey_add[2*i+1] <== encrypt_add[i].ephemeralKey[1];

    }
    component he_add_message[8];
    component he_empheralKey[8];
    for (var i = 0; i < 8; i++) {
        he_add_message[i] = BabyAdd();
        
        he_add_message[i].x1 <== encrypt_add[i].encryptedMessage[0];
        he_add_message[i].y1 <== encrypt_add[i].encryptedMessage[1];
        he_add_message[i].x2 <== point_org[2*i];
        he_add_message[i].y2 <== point_org[2*i+1];
        point_he[2*i] <== he_add_message[i].xout;
        point_he[2*i+1] <== he_add_message[i].yout;

        he_empheralKey[i] = BabyAdd();
        he_empheralKey[i].x1 <== ephemeralKey_add[2*i];
        he_empheralKey[i].y1 <== ephemeralKey_add[2*i+1];
        he_empheralKey[i].x2 <== ephemeralKey_org[2*i];
        he_empheralKey[i].y2 <== ephemeralKey_org[2*i+1];
        ephemeralKey_he[2*i] <== he_empheralKey[i].xout;
        ephemeralKey_he[2*i+1] <== he_empheralKey[i].yout;
    }
    //hash the input_add
    //TODO when further validation is needed add here to check against signature
    // component poseidon = Poseidon(2);
    // for (var i = 0; i < 2; i++) {
    //     poseidon.inputs[i] <== input_add;
    // }
    // hashed_input_add <== poseidon.out;
    //component encrypt2 = Encrypt();
    
    

}