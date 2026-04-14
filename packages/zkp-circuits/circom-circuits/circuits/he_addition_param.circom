pragma circom 2.1.2;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "./encrypt.circom";
include "../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom"; // For Num2Bits





template HomomorphicAddParam(bits_per_chunk, num_chunks) {

    //plaintext big number to add, 120 bits
    signal input input_add;
    //public key for encryption
    signal input publicKey[2];
    //nonce key for encryption
    signal input nonceKey_add[num_chunks];
    //TODO:signature validation & message_base validation


    //Original cihpertext from signature
    signal input point_org[num_chunks * 2];    
    signal input ephemeralKey_org[num_chunks * 2];

    //homomorphic addition
    signal output ephemeralKey_he[num_chunks * 2];
    signal output point_he[num_chunks * 2];

    //signal output hashed_input_add;
    
    signal message_add_31bit[num_chunks];
    signal ephemeralKey_add[num_chunks * 2];
    signal point_add[num_chunks * 2];
    component num2Bits;
   

    num2Bits = Num2Bits(bits_per_chunk * num_chunks);
    num2Bits.in <== input_add;
    

    
    // Declare arrays to hold Bits2Num components
    component bits2num_add[num_chunks];
    
    for (var j = 0; j < num_chunks; j++) {
        var startBit = j * bits_per_chunk;
        var nBits = bits_per_chunk;

        // if (j == 3) {
        //     // Handle the remainder bits for the last chunk
        //     nBits = 27; // Correctly set to 27 bits for the last chunk
        // }

        // Instantiate Bits2Num components with a fixed size of 31 bits
        bits2num_add[j] = Bits2Num(bits_per_chunk);

        // Assign bits to the Bits2Num components
        for (var b = 0; b < nBits; b++) {
            bits2num_add[j].in[b] <== num2Bits.out[startBit + b];            
        }

        // Pad remaining bits with zeros for the last chunk
        if (nBits < bits_per_chunk) {
            for (var b = nBits; b < bits_per_chunk; b++) {
                bits2num_add[j].in[b] <== 0;
                
            }
        }

        message_add_31bit[j] <== bits2num_add[j].out;
    }

    
    component encrypt_add[num_chunks];
    component encodeMsg_add[num_chunks];
    for (var i=0; i<num_chunks; i++) {
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
    component he_add_message[num_chunks];
    component he_empheralKey[num_chunks];
    for (var i = 0; i < num_chunks; i++) {
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
   
}