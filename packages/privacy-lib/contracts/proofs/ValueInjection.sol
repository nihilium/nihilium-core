// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IVerifier.sol";




contract ValueInjection is IVerifier { 
  
  constructor() {
  }
 
  /**
   * @dev proof is empty
   * @param proof proof is empty
   * @dev publicSignals[0] a boolean value
   * @param publicSignals The public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
    assert(publicSignals.length == 1);
    assert(proof.length == 0);    
    
    return true;
  }


}
