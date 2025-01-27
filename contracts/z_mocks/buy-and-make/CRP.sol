// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.2;
pragma abicoder v2;

abstract contract ConfigurableRightsPool  {

    function createPool(uint initialSupply)
        external
        virtual;

    function whitelistLiquidityProvider(address provider)
        external
        virtual;
    
    function setController(address newOwner) external virtual;
}