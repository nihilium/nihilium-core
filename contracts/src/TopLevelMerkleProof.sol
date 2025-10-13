// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./Interfaces.sol";



/**

  
pub fn main(
    subtree_root: Field,
    block_timestamp: Field,
    root: Field,
    path: [Field; DEPTH],
    index_bits: [u1; DEPTH],
) -> pub (Field, Field, Field, Field) {
   
    let leaf = mimc_hash([subtree_root, block_timestamp]);
    let computed_root = binary_merkle_root::<DEPTH>(mimc_hash, leaf, DEPTH, index_bits, path);

    assert(computed_root == root);
    (computed_root, block_timestamp, subtree_root, bits_to_index(index_bits))
}
 */

contract TopLevelMerkleProof is IVerifier {
 
function extractBytes32List(bytes memory data) public pure returns (bytes32[] memory) {
    require(data.length % 32 == 0, "Invalid length");

    uint items = data.length / 32;
    bytes32[] memory result = new bytes32[](items);

    for (uint i = 0; i < items; i++) {
        bytes32 item;
        // Use assembly to load 32 bytes from data at the correct offset
        assembly {
            item := mload(add(add(data, 32), mul(i, 32)))
        }
        result[i] = item;
    }

    return result;
}
 
  constructor() {
  }


  /**
   * @dev proof contains stacked bytes32 values used for the merkle proof
   * @param proof The proof to verify
   * @dev publicSignals[0] is the root of the value tree
   * @dev publicSignals[1] is the timestamp value
   * @dev publicSignals[2] is the subtree root
   * @dev publicSignals[3] is the index of the leaf
   * @param publicSignals The public signals to verify
   */
  function verify(bytes calldata proof, bytes32[] calldata publicSignals) external pure returns (bool) {
    uint32 levels = uint32(proof.length/ 32);
    bytes32[] memory proofBytes32 = extractBytes32List(proof);
    bytes32 currentLeafValue = _efficientHash(publicSignals[2], publicSignals[1]);
    uint256 currentIndex = uint256(publicSignals[3]);
    bytes32 computedRoot = publicSignals[0];
    for (uint32 i = 0; i < levels; i++) {
      currentLeafValue = (((currentIndex & (1 << i)) >> i) == 1) 
            ? _efficientHash(proofBytes32[i], currentLeafValue)
            : _efficientHash(currentLeafValue, proofBytes32[i]);
    }
    return currentLeafValue == computedRoot;
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

}
