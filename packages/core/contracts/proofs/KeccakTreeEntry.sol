// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IVerifier.sol";




contract KeccakTreeEntry is IVerifier { 
  
  constructor() {
  }

  function _efficientHash(bytes32 a, bytes32 b)
    public
    pure
    returns (bytes32 value)
    {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }
  /**
   * @dev proof is empty
   * @param proof proof is empty
   * @dev publicSignals[0] is the reveal value
   * @dev publicSignals[1] is the expected hash of the reveal value
   * @param publicSignals The public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
    assert(publicSignals.length == 2);
    assert(proof.length == 0);    
    
    return _efficientHash(publicSignals[0], bytes32(0)) == publicSignals[1];
  }


}
