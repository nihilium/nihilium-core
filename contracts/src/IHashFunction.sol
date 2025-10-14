// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

interface HashFunction {
    function hash(bytes32[] calldata inputs) external view returns (bytes32);
}