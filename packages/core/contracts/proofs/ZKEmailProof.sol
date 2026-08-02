// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./DKIMRegistry.sol";
import "./FixedCallProxy.sol";
import "./IVerifier.sol";




contract ZKEmailProof is FixedCallProxyProof { 
  
  DKIMRegistry public registry;
  constructor(address[] memory _contracts, DKIMRegistry _registry) FixedCallProxyProof(_contracts) {
    registry = _registry;
  }

  /**
   * @dev proof is the proof to verify
   * @param publicSignals[0] is the timestamp to check against the registry
   * @param publicSignals[1] is address of the zkemail proof contract.
   * @param publicSignals[2:] is the public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external view returns (bool) {
    bytes32 domainNameHash = _domainNameHash(publicSignals[3:7]);
    if(!registry.isKeyHashValidAt(domainNameHash, publicSignals[2], uint256(publicSignals[0]))) {
      return false;
    }
    return this.internal_verify(proof, publicSignals[1:]);
  }

  /**
   * @dev Recomputes keccak256(bytes(domainName)) from the domain fields exposed by the
   *      circuit, so it matches DKIMRegistry's `keccak256(bytes(domainName))`.
   *
   *      The circuit packs the domain (zero-padded printable ASCII) little-endian, 31
   *      bytes per field:
   *          field[c] = sum_{j=0}^{30} domain[c*31 + j] * 256^j
   *      i.e. domain[c*31 + j] is the j-th least-significant byte of field[c] (the most
   *      significant, 32nd byte of each word is always zero and is ignored).
   *
   *      We rebuild the byte string in order, then trim the trailing zero padding: since
   *      the domain is printable ASCII it contains no NUL byte, so the last non-zero byte
   *      marks the true end of the string. Hashing exactly those bytes reproduces the
   *      registry's `keccak256(bytes(domainName))`.
   */
  function _domainNameHash(bytes32[] calldata fields) internal pure returns (bytes32) {
    bytes memory domain = new bytes(fields.length * 31);
    uint256 len = 0;
    for (uint256 c = 0; c < fields.length; c++) {
      uint256 word = uint256(fields[c]);
      for (uint256 j = 0; j < 31; j++) {
        uint8 b = uint8(word >> (8 * j));
        uint256 pos = c * 31 + j;
        domain[pos] = bytes1(b);
        if (b != 0) {
          len = pos + 1;
        }
      }
    }
    // Trim to the true domain length (drop trailing zero padding) before hashing.
    assembly {
      mstore(domain, len)
    }
    return keccak256(domain);
  }
}
