// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.2;

import { ModuleKeys } from "../../shared/ModuleKeys.sol";

contract MockNexus is ModuleKeys {
    address public governor;
    bool private _initialized; 

    mapping(bytes32 => address) public modules;

    constructor(
        address _governorAddr,
        address _savingsManager,
        address _interestValidator
    )
    {
        governor = _governorAddr;
        modules[KEY_SAVINGS_MANAGER] = _savingsManager;
        modules[KEY_INTEREST_VALIDATOR] = _interestValidator;
        _initialized = true;
    }

    function initialized() external view returns (bool){
        return _initialized;
    }

    function getModule(bytes32  _key) external view returns (address) {
        return modules[_key];
    }

    function setSavingsManager(address _savingsManager) external {
        modules[KEY_SAVINGS_MANAGER] = _savingsManager;
    }

    function setInterestValidator(address _interestValidator) external {
        modules[KEY_INTEREST_VALIDATOR] = _interestValidator;
    }
}