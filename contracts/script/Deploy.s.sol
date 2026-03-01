// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/NexusEscrow.sol";

contract Deploy is Script {
    // Base Sepolia USDC
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        vm.startBroadcast();

        NexusEscrow nexus = new NexusEscrow(USDC);
        console.log("NexusEscrow deployed:", address(nexus));

        vm.stopBroadcast();
    }
}
