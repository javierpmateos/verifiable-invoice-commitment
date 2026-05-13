// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {InvoiceCommitmentRegistry} from "../src/InvoiceCommitmentRegistry.sol";

/// @notice Deterministic CREATE2 deployment for the canonical singleton registrar.
/// @dev    Same bytecode + same salt yields the same address on every EVM chain.
contract Deploy is Script {
    bytes32 internal constant SALT = keccak256("ERC-XXXX.VerifiableInvoiceCommitment.v1");

    function run() external returns (address deployed) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployerAddr = vm.addr(deployerKey);
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployerAddr);
        console2.log("Salt:", vm.toString(SALT));
        vm.startBroadcast(deployerKey);
        InvoiceCommitmentRegistry registry = new InvoiceCommitmentRegistry{salt: SALT}();
        deployed = address(registry);
        vm.stopBroadcast();
        console2.log("InvoiceCommitmentRegistry deployed at:", deployed);
    }
}
