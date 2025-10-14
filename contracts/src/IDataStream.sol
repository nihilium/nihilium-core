// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

interface IDataStream {
    function isKnownValueRoot(bytes32 _root) external view returns (bool);
    function isKnownMerkleRoot(bytes32 _root) external view returns (bool);
}