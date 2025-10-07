// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./Interfaces.sol";



/**

  
 */

contract EmpheralMerkleTreeKeccak is Ownable {
  event Log(bytes32 value1,bytes32 value2,uint value3);
  //event Log(uint value);
  event TreeUpdate(uint32 leafIndex, bytes32 leafValue,  uint256 timestamp, bytes32 newValueRoot);
  uint32 public levels = 20;
  uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
  bytes32 public constant ZERO_VALUE = 0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6; // = keccak256("tornado") % FIELD_SIZE
  //IHasher public immutable hasher;
  
  // Precomputed zero values for each level
  
  
  

  //  ----- these could be wrapped in a struct and use this contract as a tree factory -----
  
  mapping(uint256 => bytes32) public merkleRoots;

  
  uint public treeStopped = 0;
  uint32 public currentIndex = 0;
  
  uint32 public maxValue;
  //  ----------------------

  uint32 public constant ROOT_HISTORY_SIZE = 60;
  // uint32 public constant ROOT_TIME_SLIPPAGE_IN_SECONDS = 60 * 30; //30 minutes;
  

  constructor(
    address owner,
    uint32 _levels
    //The first merkle root is neccesary to start the tree and not introduce special cases
    // on the insert function. It should however be a proper value
    
    ) Ownable(owner) {
   
    levels = _levels;
    //We could do an actual insert here where all leafs are 0 to instantiate the tree
    //with proper time.
    merkleRoots[0] = zeros(levels);
    transferOwnership(owner);
  }


  function stopTree() public onlyOwner {
    treeStopped = block.timestamp;
  }

  /*
    Even though a more efficient assembly version can be written for a purely figuring
    out the divergence level. The fact that MOST divergences happen on lower levels
    and the loop returns early, make this implementation on average cheaper.
  */
  function findDivergenceLevelForNext(uint256 a) public view returns (uint256) {
    uint256 next = a + 1;
    
    // Find lowest set bit using bitwise operations
    uint256 lowestBit = next & (~next + 1);
    
    // Convert to position
    unchecked {
        for (uint256 i = 0; i < levels; i++) {
            if (lowestBit == (1 << i)) {
                return i;
            }
        }
    }
    return levels;
}


    /*
    @dev Inserts a new value into the tree.
    The function takes the previousLeaf and the path of the previous leaf.
    It calculates the merkle root of the previous leaf. The insertValue
    is combined with block.timestamp to create the new leaf.
    The new leaf is then combined with the previous leaf and path
    to create a new merkle root. That is cached in the contract.
  
    @param previousLeaf The previous leaf of the tree.
    @param insertValue The value to insert into the tree.
    @param valuePath The path of the tree.
    @return index The index of the new leaf.
    */
    function insert( bytes32 previousLeaf, bytes32 insertValue, bytes32[] calldata previousLeafPath) public onlyOwner returns (uint32 index)  {
      
      
      require(treeStopped == 0, "Cannot insert into stopped tree");
      require(currentIndex + 1 != uint32(2)**levels, "Merkle tree is full. No more leaves can be added");
      require(previousLeafPath.length == levels, "Value path length must be equal to levels");
      
      bytes32 newPathHash;
      bytes32 currentValueLeaf = previousLeaf;
      //Divergence level is the level at which the new path diverges from the old path.
      uint256 divergenceLevel = findDivergenceLevelForNext(currentIndex);
      
      //First we calculate the old path. Meanwhile we use the divergence level to calculate the new path.

      bytes32 newValueLeafHash = _efficientHash(insertValue, bytes32(block.timestamp));
      uint32 newIndex = currentIndex + 1;
      for (uint32 i = 0; i < levels;) {
        
        //If we hit divergence level we use the current hashed value
        if(i == divergenceLevel){         
          newPathHash = currentValueLeaf;
        }else{
          newPathHash = previousLeafPath[i];
        }
        
        //Normally hash the merkle path with a left right pos
        if (((currentIndex & (1<<i)) >> i) == 0) {         
           currentValueLeaf = _efficientHash(currentValueLeaf, previousLeafPath[i]);     
        } else {
          currentValueLeaf = _efficientHash(previousLeafPath[i], currentValueLeaf);
          //if the current level is before the divergence level we must use a null value
          //for hashing the new path.
          if(i<divergenceLevel){
            newPathHash = zeros(i);
          }
        }
        //We do normal left right hashing for the new path,
        //where the newPathHash is the altered version of the old path.
        newValueLeafHash = (((newIndex & (1 << i)) >> i) == 1) 
            ? _efficientHash(newPathHash, newValueLeafHash)
            : _efficientHash(newValueLeafHash, newPathHash);
          
        unchecked { ++i; }
      }
      require(currentValueLeaf == merkleRoots[currentIndex % ROOT_HISTORY_SIZE], "Value leaf mismatch");
      unchecked {
        currentIndex += 1;
      }
      
      merkleRoots[currentIndex  % ROOT_HISTORY_SIZE] = newValueLeafHash;
     
      
      emit TreeUpdate(currentIndex, insertValue, block.timestamp, newValueLeafHash);
      
      return currentIndex;
  }

 


  /**
    @dev Whether the root is present in the root history
  */
 //TODO fix uint256 to bytes32, deal with interface and other dualmerkle tree
  function isKnownValueRoot(bytes32 _root) public view returns (bool) {
    if (bytes32(_root) == merkleRoots[currentIndex % ROOT_HISTORY_SIZE]) {
      return true;
    }
    uint32 i = ROOT_HISTORY_SIZE - 1;
    do {
      if (bytes32(_root) == merkleRoots[i]) {
        return true;
      }    
      i--;
    } while (i != 0);
    return false;
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

 

  function getLastMerkleRoot() public view returns (bytes32) {  
    return merkleRoots[currentIndex % ROOT_HISTORY_SIZE];
  }



  function iToHex(bytes memory buffer) public pure returns (string memory) {

        // Fixed buffer size for hexadecimal convertion
        bytes memory converted = new bytes(buffer.length * 2);

        bytes memory _base = "0123456789abcdef";

        for (uint256 i = 0; i < buffer.length; i++) {
            converted[i * 2] = _base[uint8(buffer[i]) / _base.length];
            converted[i * 2 + 1] = _base[uint8(buffer[i]) % _base.length];
        }

        return string(abi.encodePacked("0x", converted));
    }

  /// @dev provides Zero (Empty) elements for a Keccak MerkleTree. Up to 32 levels, null = Keccack(42, 42)
  function zeros(uint256 i) public pure returns (bytes32) {
    if (i == 0) return bytes32(0x937759b0c00d3bc82439e3acdb505be98d7bca79f508bb77a8bfafc2666260a6);
else if (i == 1) return bytes32(0x7a7c3fdf30c2ce9777d04edcb65f543e455361e76ec96c21871a7a3a27191a19);
else if (i == 2) return bytes32(0xe7a7e4e211dd196518118a87d06f710dcf2f1cc4a70b4ce2e48a82f29e1c0dd0);
else if (i == 3) return bytes32(0x9f712179411347b1d39046def4b5649545aeb9c6225f3725265d20c2d6b8b9e0);
else if (i == 4) return bytes32(0x5132c6bd28c84e48a10b478bff9deafbd8e4c0e101a96945a0f1195b35c80365);
else if (i == 5) return bytes32(0x9298319c5e0ea9c429a71713b29e974e20043655b8f5fff7451cbab6df39a005);
else if (i == 6) return bytes32(0xd9d17d93891c0827462ab567d8e3e6f35c5e85295260c11057456ba8859e3c50);
else if (i == 7) return bytes32(0xb387d2509747ca8fd9837fcf1f86f50c5d0543d80f206db7c243dd5811f90517);
else if (i == 8) return bytes32(0x741446021781666859cf5819e24c72a3d76f146a65042785bbe155342b76e0dd);
else if (i == 9) return bytes32(0x25b23f4c113c31976bc31be68b02bfc6115ef3c3c86fb71444d37da47270d944);
else if (i == 10) return bytes32(0x943d1808aaa09463cc47c4ca20db29cd66ad0328bed0bc3de23e16d14c067a9d);
else if (i == 11) return bytes32(0xba495d9fbc95fbe3f82dc3218f07ea9a3225a8efad236e0cc9ee2b1ecc035d6b);
else if (i == 12) return bytes32(0x43a5929065721e753399d0a16877608cbac5c5172d53869274297af130a76382);
else if (i == 13) return bytes32(0xc71dea48b64315cf526f0ff821bfa319281f1320820cc5ccb33540f7ad2d9cdc);
else if (i == 14) return bytes32(0x16a6b9cb631ce64ec4bc42cf04fee00a2bf21d3bef7c9d72c3c8f918ba2c8d12);
else if (i == 15) return bytes32(0x953bcd589360256ebce277d84d4db1253c4f838db20aa5111ed4dfeb29834c0e);
else if (i == 16) return bytes32(0xd22edc07cbb2bcfbfec92b7809d7fdf8b1b4c6f2f8c0995c9b8bdc35bc694246);
else if (i == 17) return bytes32(0xaaf83bf5b43630f2572ab4b0424622383d46424d634b94a6ee0853394688da5d);
else if (i == 18) return bytes32(0x40ee2da20184ed5e1f34b3eb4cff69ef05b902ac119ef0c79ee8c925828ee5a4);
else if (i == 19) return bytes32(0x94b082bc536c74d77a2fa6ee24c6e57fdcad0f1bc3de3de5024c8bbdbbfb3fb8);
else if (i == 20) return bytes32(0x1299f0c19ece5b84adae1a3b881bc291c2449cdf40bc330986ce8947d068b136);
else if (i == 21) return bytes32(0x7d42550dfa1c5157b97b88e723d7f3881136b4ba3cf1bb144ad0a93afe8eae1e);
else if (i == 22) return bytes32(0xbeee09f5ee62425cd4b0efb45fbe71e0ddf2e2b99c2f1331bd0e69a623bc2881);
else if (i == 23) return bytes32(0x37f2ddf623bfebe0ced8213be19d806f308f8f6f966de7f4b8f35fbdd5e2d27b);
else if (i == 24) return bytes32(0xb592c830c0ebe458a81e2eb339bf0ba3f8364bbca271cd31a56d676905af52db);
else if (i == 25) return bytes32(0x421eee4c46c647a6baeb74d9d00e8dfd5caed87d6f0148d679dc39586f4eda48);
else if (i == 26) return bytes32(0xa2aa2bf832e89846c7fc8cef2fcc9bd06c141d1e081587df2cd733686bc4c530);
else if (i == 27) return bytes32(0x6eabcbee0548e7f50c9b5ba0f88ad9b0c869709a624491cef3a92ff25197cff1);
else if (i == 28) return bytes32(0xd732a7806dcb4e6e3a873f7c8e66f9a9cac5af24037ead5e0940f356caffca8a);
else if (i == 29) return bytes32(0x1d35bdb9f5810e9b4676edc20094d981cb3ee2fb2f426586089f15c648028b0f);
else if (i == 30) return bytes32(0x177a46bc2a5f7fdd63b78192deafc03bd561e899f7cfe8e5a42153e34a3ff21d);
else if (i == 31) return bytes32(0xd8085c8eba168c1e390883f9fcb83f48eab1fd31d2731f3af136bbf0367dd2fd);
else revert("Index out of bounds");
  }
}
