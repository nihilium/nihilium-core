// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./IVerifier.sol";




abstract contract FixedCallProxyProof is IVerifier { 
  
  mapping(address => bool) public isContract;
  constructor(address[] memory _contracts) {
    for (uint i = 0; i < _contracts.length; i++) {
      isContract[_contracts[i]] = true;
    }
  }

  /**
   * @dev proof is the proof to verify
   * @param publicSignals[0] is the verifier address
   * @param publicSignals[1:] is the public signals to verify
   */
  function internal_verify(bytes calldata proof, bytes32[] calldata publicSignals) external view returns (bool) {
    if(!isContract[address(uint160(uint256(publicSignals[0])))]) {
      return false;
    }
    IVerifier verifier = IVerifier(address(uint160(uint256(publicSignals[0]))));
    return verifier.verify(proof, publicSignals[1:publicSignals.length]);
  }
}
