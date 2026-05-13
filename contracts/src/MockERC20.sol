// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal mintable ERC-20 used solely for the VIC end-to-end demo.
/// @dev    Six decimals to mirror USDC on mainnet. Anyone can mint — do not
///         deploy outside of test or local environments.
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
