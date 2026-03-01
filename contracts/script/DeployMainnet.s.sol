// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/NexusEscrow.sol";

/// @notice Deploy NexusEscrow to Base mainnet.
///
/// Usage:
///   cd contracts
///   forge script script/DeployMainnet.s.sol \
///     --rpc-url base \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Required env vars: PRIVATE_KEY, ETHERSCAN_API_KEY
contract DeployMainnet is Script {
    // Base mainnet USDC
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        vm.startBroadcast();

        NexusEscrow nexus = new NexusEscrow(USDC);
        console.log("NexusEscrow deployed:", address(nexus));
        console.log("Update nexus-clearance.vercel.app VITE_CONTRACT_ADDRESS to this address.");

        vm.stopBroadcast();
    }
}
