// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {ProcessorRegistry} from "../contracts/src/ProcessorRegistry.sol";


contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address committee = vm.addr(deployerPrivateKey);
   
        vm.startBroadcast(deployerPrivateKey);

        ProcessorRegistry processorRegistry = new ProcessorRegistry(committee, committee, committee);
        console.log("ProcessorRegistry deployed at:", address(processorRegistry));

        vm.stopBroadcast();
    }
}

