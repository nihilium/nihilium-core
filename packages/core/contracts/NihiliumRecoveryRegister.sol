// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/access/Ownable.sol";

contract NihiliumRecoveryRegister is Ownable {
    constructor(address _owner) Ownable(_owner) {}
    address public recoveryAddress;


    function registerRecovery(address _recoveryAddress) public onlyOwner {
        recoveryAddress = _recoveryAddress;
    }

    function getRecoveryAddress() public view returns (address) {
        return recoveryAddress;
    }
}
