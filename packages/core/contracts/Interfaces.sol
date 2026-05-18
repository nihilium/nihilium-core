// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
interface IVerifier { 
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}

interface IDataStream {
    function isKnownValueRoot(bytes32 _root) external view returns (bool);
    function isKnownMerkleRoot(bytes32 _root) external view returns (bool);
}