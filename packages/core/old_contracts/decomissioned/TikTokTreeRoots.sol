// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;
// pragma experimental ABIEncoderV2;
// import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/utils/Strings.sol";
// // interface IHasher {
// //   function MiMCSponge(uint256 in_xL, uint256 in_xR, uint256 k) external pure returns (uint256 xL, uint256 xR);
// // }

// interface IMimc7Hasher {
//   function MiMCpe7(uint256 in_x, uint256 in_k) external pure returns (uint256 out_x);
// }

// // interface IPoseidon1Hasher {
// //   function poseidon(uint256[1] memory) external pure returns (uint256);
// // }
// // interface IPoseidon2Hasher {
// //   function poseidon(uint256[2] memory) external pure returns (uint256);
// // }
// // interface IPoseidon3Hasher {
// //   function poseidon(uint256[3] memory) external pure returns (uint256);
// // }

// /**

//   This is a class that holds 2 merkle trees.
//   One for the values being inserted and a history of the roots of the value tree.
//   The reason for this is that this value tree can be used to prove inclusion in the tree with ZKP.
//   The merkleRoot tree is used to validate an historical ZKP that was once valid but needs to be reproven.
//   A new ZKP can be made for the merkleRoot tree in conjunction with the original ZKP.
//  */

// struct MerkleTreeValue {
//   uint256 leaf;
//   uint256 minusOneMerkleRoot;
// }

// contract TikTokTreeRoots is Ownable {
//   event Log(bytes32 value1,bytes32 value2,uint value3);
//   //event Log(uint value);
//   event TreeUpdate(uint256 indexed commitment, uint32 leafIndex, address depositAddress, uint256 timestamp, uint256 leafHash, uint256 newValueRoot, uint256 newMerkleRoot);
  
//   uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
//   uint256 public constant ZERO_VALUE = 7507787612525723758659662260399184323980001748885802124580171315331567144978; // = keccak256("tornado") % FIELD_SIZE
//   //IHasher public immutable hasher;
//   IMimc7Hasher public immutable treeHasher;
  

//   //A map that contains (leaf value, and previous merkle root)
//   mapping(uint256 => MerkleTreeValue) public treeValuesAndRoots;
//   uint32 public valueIndex = 0;
//   mapping(uint256 => uint256) public valueRoots;
//   mapping(uint256 => uint256) public merkleRoots;
//   mapping(uint256 => uint256) public valueRootTimestamps;
//   mapping(uint256 => uint256) public merkleRootTimestamps;
  
//   // uint public treeStopped = 0;
//   // uint32 public currentRootIndex = 0;
//   // uint32 public nextIndex = 0;
//   // uint32 public levels;
//   // uint32 public rootTreeLevels;
//   // uint32 public maxValue;
//   //  ----------------------

//   uint32 public ROOT_HISTORY_SIZE = 20;
//   //uint32 public ROOT_TIME_SLIPPAGE_IN_SECONDS = 60 * 30; //30 minutes;
  

//   constructor(
//     address owner,
//     uint32 _levels,
//     //Power of 2 for proving interval, default should be 6 to have 64 leaves per proof, a proof every minute,
//     //Would then result in a ZK proof ~ every hour
//     uint32 _proofLevelInterval, 
//     uint32 _rootHistorySize,
//     uint32 _rootTimeSlippageInSeconds,
//     //IHasher _hasher,    
//     IMimc7Hasher _treeHasher) Ownable(owner) {
//       require(_levels > 0, "_levels should be greater than zero");
//       require(_levels < 32, "_levels should be less than 32");
//       require(_rootHistorySize > 10, "_rootHistorySize should be greater than 10");
//       require(_rootTimeSlippageInSeconds > 10 * 60, "_rootTimeSlippageInSeconds should be greater than 10 minutes");
//       ROOT_HISTORY_SIZE = (uint32(2)**_proofLevelInterval)-1;
//       levels = _levels;
//       //hasher = _hasher;
     
//       transferOwnership(owner);
//   }


//   function hashLeftRightPos(
//     uint256 _left,
//     uint256 _right
//   ) public view returns (uint256) {
    
//     return treeHasher.MiMCpe7(_left, _right);
//   }

  
//   // /**
//   //   @dev Hash 2 tree leaves, returns MiMC(_left, _right)
//   // */
//   // function hashLeftRightIndex(
//   //   IHasher _hasher,
//   //   bytes32 _left,
//   //   bytes32 _right,
//   //   uint256 leftRight
//   // ) public pure returns (bytes32) {
//   //   if(leftRight == 1){
//   //     return hashLeftRight(_hasher, _right, _left);
//   //   }
//   //   return hashLeftRight(_hasher, _left, _right);
//   // }

//   function stopTree() public onlyOwner {
//     treeStopped = block.timestamp;
//   }

// //   //Called externally, this contract has no knowledge wether there is a withdraw or not
// //   //But to group both deposit and withdrawal events under the same address we emit it here.
// //   function emitWithdraw(address to, bytes32 nullifierHash, uint256 timestamp ) public onlyOwner {
// //     emit Withdrawal(to, nullifierHash, timestamp); 
// //   }

//   function insert(uint256 _leaf, uint356 _minusOneMerkleRoot) public onlyOwner returns (uint32 index)  {
    
//     uint256 timestamp = block.timestamp;
//     require(treeStopped == 0, "Cannot insert into stopped tree");
//     require(_nextIndex != uint32(2)**levels, "Merkle tree is full. No more leaves can be added");
//     uint32 currentIndex = _nextIndex;
    
//     uint256 currentLevelHash = treeHasher.MiMCpe7(_leaf, timestamp);
//     uint256 leafHash = treeHasher.MiMCpe7(_leaf, timestamp);
//     uint256 left;
//     uint256 right;
   

//     uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
//     currentRootIndex = newRootIndex;
    
//     valueRoots[newRootIndex] = currentLevelHash;
//     valueRootTimestamps[newRootIndex] = timestamp;

//     uint32 merkleRootIndex = insertMerkleRoot(currentLevelHash, _origin);
//     nextIndex = _nextIndex + 1;
//     assert(merkleRootIndex == nextIndex);
//     emit TreeUpdate(_leaf, _nextIndex, _origin, timestamp, leafHash, currentLevelHash, merkleRoots[newRootIndex]);
//     //emit TreeUpdate(_leaf, _nextIndex, _origin, timestamp, leafHash, currentLevelHash, _hash2);
//     return nextIndex;
//   }

//   function insertMerkleRoot(uint256 new_root, address _origin) private returns (uint32 index)  {
//     uint32 _nextIndex = nextIndex;
//     require(treeStopped == 0, "Cannot insert into stopped tree");
//     require(_nextIndex != uint32(2)**levels, "Merkle tree is full. No more leaves can be added");
//     uint32 currentIndex = _nextIndex;
//     uint256 timestamp = block.timestamp;
//     uint256 currentLevelHash = treeHasher.MiMCpe7(uint256(new_root), timestamp);
//     //uint256 leafHash = treeHasher.MiMCpe7(uint256(new_root), timestamp);
//     uint256 left;
//     uint256 right;

//     for (uint32 i = 0; i < levels; i++) {
//       if (currentIndex % 2 == 0) {
//         left = currentLevelHash;
//         right = zeros(i);
//         filledmerkleRootSubtrees[i] = currentLevelHash;
//       } else {
//         left = filledmerkleRootSubtrees[i];
//         right = currentLevelHash;
//       }
      
//       currentLevelHash = hashLeftRightPos(left, right);
//       currentIndex /= 2;
//     }

//     // uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
//     // currentRootIndex = newRootIndex;
    
//     merkleRoots[currentRootIndex] = currentLevelHash;
//     merkleRootTimestamps[currentRootIndex] = timestamp;

   
//     return _nextIndex + 1;
//   }

//   // function hashLeaf(bytes32 commit, uint32 index, uint32 timestamp) public view returns (bytes32) {
//   //     bytes32 indexTimestampHash = hashLeftRight(hasher,  bytes32(uint256(index)), bytes32(timestamp));
//   //     return hashLeftRight(hasher, commit, indexTimestampHash );
//   // }

 
  

//   function iToHex(bytes memory buffer) public pure returns (string memory) {

//         // Fixed buffer size for hexadecimal convertion
//         bytes memory converted = new bytes(buffer.length * 2);

//         bytes memory _base = "0123456789abcdef";

//         for (uint256 i = 0; i < buffer.length; i++) {
//             converted[i * 2] = _base[uint8(buffer[i]) / _base.length];
//             converted[i * 2 + 1] = _base[uint8(buffer[i]) % _base.length];
//         }

//         return string(abi.encodePacked("0x", converted));
//     }


//   /**
//     @dev Whether the root is present in the root history
//   */
//   function isKnownValueRoot(uint256 _root) public view returns (bool) {
//     if (_root == valueRoots[currentRootIndex]) {
//       return true;
//     }
    
//     uint32 _currentRootIndex = currentRootIndex;
//     uint32 i = _currentRootIndex;
//     do {
//       if (_root == valueRoots[i] && (valueRootTimestamps[i] > block.timestamp - ROOT_TIME_SLIPPAGE_IN_SECONDS)) {
//         return true;
//       }
//       if (i == 0) {
//         i = ROOT_HISTORY_SIZE;
//       }
//       i--;
//     } while (i != _currentRootIndex);
//     return false;
//   }

//   /**
//     @dev Whether the root is present in the root history
//   */
//   function isKnownMerkleRoot(uint256 _root) public view returns (bool) {
//     if (_root == merkleRoots[currentRootIndex]) {
//       return true;
//     }
    
//     uint32 _currentRootIndex = currentRootIndex;
//     uint32 i = _currentRootIndex;
//     do {
//       if (_root == merkleRoots[i] && (merkleRootTimestamps[i] > block.timestamp - ROOT_TIME_SLIPPAGE_IN_SECONDS)) {
//         return true;
//       }
//       if (i == 0) {
//         i = ROOT_HISTORY_SIZE;
//       }
//       i--;
//     } while (i != _currentRootIndex);
//     return false;
//   }

//   /**
//     @dev Returns the last root
//   */
//   function getLastValueRoot() public view returns (uint256) {
//     return valueRoots[currentRootIndex];
//   }

//   function getLastMerkleRoot() public view returns (uint256) {  
//     return merkleRoots[currentRootIndex];
//   }

//   /// @dev provides Zero (Empty) elements for a MiMC MerkleTree. Up to 32 levels
//   function zeros(uint256 i) public pure returns (uint256) {
//     if (i == 0) return uint256(0x109941d7e783a474682dbaee4c1e3b86262aea4bf882a0e535e0e07f68b35012);
// else if (i == 1) return uint256(0x24a2235d47728da5a59cfac1ecb449588c14fd8f0a55edf4b5d6f6f028f18675);
// else if (i == 2) return uint256(0x00f21e57e9d8d2637710b96df868a4c1dc9ddc8313e854cba77bc4657f62122a);
// else if (i == 3) return uint256(0x03a3740c613aa897ba583719df56d1d2cab991446425d1b0af67ba069165d901);
// else if (i == 4) return uint256(0x14453cbf5f95ef034a67b7f8d2ad167dc13e2f2f71a4166c67461b111da0a59c);
// else if (i == 5) return uint256(0x18a1134dfd91106636a8907463636a4268d72f1efd9dc0b1f4abc9d5741a94d0);
// else if (i == 6) return uint256(0x2028822cdc4e57d74fd545af1383258b073516963d96a3a24d9994c0dbdde595);
// else if (i == 7) return uint256(0x03d7f4b7a4325f1b0442e8bef19d194af26ce48a4a7071d71b0c53f47b21edb7);
// else if (i == 8) return uint256(0x2431db3ab29b3424d01c413de66c60d35f8ab365f36c68839aaaec84f30de951);
// else if (i == 9) return uint256(0x1fe5be6877b6c8e906e99fd4927cd6e0669eca580eb7927f83752680ecd42b81);
// else if (i == 10) return uint256(0x30142f9f1ab4f0fda23bf97970d7b3ef843a6a876d239174c2130443f9dad7f6);
// else if (i == 11) return uint256(0x0248329a4e2b5436dae548a27ec140b4d1ff088e9d4cfcb9aca60a31865f398a);
// else if (i == 12) return uint256(0x00c1fc7707bfdd173890973e627eee34e944d31b0bcaf135a1988b5aec090028);
// else if (i == 13) return uint256(0x1ceb497254e320bcb94933bcbc143d9c5ee998113b4b56c3ab7538ceca358529);
// else if (i == 14) return uint256(0x0bdb300e4c46554ec6e3abc9a59ff39f103fca765f0b5b7d1825b713b1c71714);
// else if (i == 15) return uint256(0x1cdbd9c157c81a2970c69196a0b7557ebb5b482decdfb0c5f435db69626a77a0);
// else if (i == 16) return uint256(0x215e39d128e805973649c0aeb9a68724fda8d50a80eb68cd7cf58658a9f97faa);
// else if (i == 17) return uint256(0x2315b9bc931dec7260d2ff4052a201d895d1749fa30d2aaaf912a8b5ed508941);
// else if (i == 18) return uint256(0x03ea027ffb94cb652948a1d895d0d30246a5f5183ca3e19abe71c36ef4fb900c);
// else if (i == 19) return uint256(0x0366f5ffa1dca6fbd58e2d535f9a1366c1aaf1b58280afcf008026b07fd73d2f);
// else if (i == 20) return uint256(0x145d81a700b9092e6b88ffca7cbed1a6c121f1d88f79c8bfab0e16f0bd00589e);
// else if (i == 21) return uint256(0x1b51221a27906a2e273b81fe270f8121491d20a45b235e242c184ebaf5dc0fc9);
// else if (i == 22) return uint256(0x2574c6a682d5a1cbbff3931e725a0ceaa32445ed698d0e1ed4a118e0b5fb87f9);
// else if (i == 23) return uint256(0x034bf3d3266153fb7eba533960be1e6d4d7af68ef5006fc23842c5fb6bba331d);
// else if (i == 24) return uint256(0x0aab92e43f974690480c2b96156ba51f5998255a6127d60f9755ffdd0b19a5e8);
// else if (i == 25) return uint256(0x085afe92af4202808c8a6b5c7593ef45b9a688616761b261219025ad566af419);
// else if (i == 26) return uint256(0x0a7fcc7abe5b585f9b359f020810544bdb874b9bce960abea6d8b369f11aa061);
// else if (i == 27) return uint256(0x004a0790ecc7ceff322e8a7bbb3f7d833de73269827dea7aaf55b52be2949047);
// else if (i == 28) return uint256(0x069353228c4f60655e962b94d75ee587c8bb007f9bed9983a7c96e17460b77d9);
// else if (i == 29) return uint256(0x0c2201fefcd44268236bc31a8e1629e8b3fd888d6f56047f24c3f925f263778e);
// else if (i == 30) return uint256(0x2184e430425c0534fca85234af66dab9c98f7a3eddcc437be274a78ddd150c78);
// else if (i == 31) return uint256(0x1e37e66b28a8a3ec7522b0fa2d0ffa8388428f48499976e551a8934841870d9b);
// else revert("Index out of bounds");
//   }
// }
