// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IVerifier.sol";




contract VerifyEDDSA is IVerifier { 
  
  constructor() {
  }

  /**
   * @dev proof contains the signature (65 bytes: r + s + v)
   * @param proof The signature bytes (65 bytes)
   * @dev publicSignals[0] is the address of the signer (bytes32, last 20 bytes)
   * @dev publicSignals[1] is the messageHash being signed
   
   * @param publicSignals The public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
    require(publicSignals.length == 2, "Invalid public signals length");
    require(proof.length == 65, "Invalid signature length");
   
    // Extract address from publicSignals[0] (last 20 bytes of bytes32)
    address signerAddress = address(uint160(uint256(publicSignals[0])));
    
    // Extract r, s, v from signature
    bytes32 r;
    bytes32 s;
    uint8 v;
    
    // Copy calldata to memory for easier access
    bytes memory sig = new bytes(65);
    for (uint i = 0; i < 65; i++) {
      sig[i] = proof[i];
    }
    
    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := byte(0, mload(add(sig, 96)))
    }
    
    // Normalize v: signatures use 27/28, but ecrecover expects 0/1
    if (v >= 27) {
      v -= 27;
    }
    
    // Recover the signer address from the signature using the messageHash directly
    address recoveredAddress = ecrecover(publicSignals[1], v, r, s);
    
    // Verify the recovered address matches the expected signer
    return recoveredAddress != address(0) && recoveredAddress == signerAddress;
  }


}
