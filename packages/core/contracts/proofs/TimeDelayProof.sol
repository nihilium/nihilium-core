// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IVerifier.sol";




contract TimeDelayProof is IVerifier { 
  
  constructor() {
  }

  /**
   * @dev proof is empty
   * @param proof proof is empty
   * @dev publicSignals[0] is the timestamp being checked
   * @dev publicSignals[1] is the timestamp to check against
   * @dev publicSignals[2] is the offset
   
   * @param publicSignals The public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
    assert(publicSignals.length == 3);
   
    return uint256(publicSignals[0]) > uint256(publicSignals[1]) && 
      uint256(publicSignals[0]) < (uint256(publicSignals[1]) - uint256(publicSignals[2]));
  }


}
