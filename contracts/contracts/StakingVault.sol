// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StakingVault - where the whole economy's fees land.
/// @notice Stake CYCLE, earn a pro-rata share of every protocol fee: task
/// marketplace fees, compute market fees, agent-share trading fees,
/// prediction market rake and slashed stakes. This is the token's value
/// accrual: activity anywhere in the agent economy pays stakers here.
/// Classic accumulated-reward-per-share accounting; fees received while
/// nobody is staked are buffered and folded into the next distribution.
contract StakingVault is ReentrancyGuard {
    uint256 private constant PRECISION = 1e18;

    IERC20 public immutable cycle;

    uint256 public totalStaked;
    uint256 public accFeePerShare; // scaled by PRECISION
    uint256 public pendingBuffer;  // fees received while totalStaked == 0
    uint256 public totalFeesReceived;

    mapping(address => uint256) public stakedOf;
    mapping(address => uint256) private _rewardDebt;
    mapping(address => uint256) private _owed;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event FeeNotified(address indexed from, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);

    constructor(IERC20 _cycle) {
        cycle = _cycle;
    }

    /// @notice Pull `amount` CYCLE from the caller and distribute to stakers.
    /// Every protocol contract calls this with its fees; anyone may donate.
    function notifyFee(uint256 amount) external nonReentrant {
        if (amount == 0) return;
        require(cycle.transferFrom(msg.sender, address(this), amount), "vault: pull failed");
        totalFeesReceived += amount;
        if (totalStaked == 0) {
            pendingBuffer += amount;
        } else {
            accFeePerShare += ((amount + pendingBuffer) * PRECISION) / totalStaked;
            pendingBuffer = 0;
        }
        emit FeeNotified(msg.sender, amount);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "vault: zero");
        _settle(msg.sender);
        require(cycle.transferFrom(msg.sender, address(this), amount), "vault: pull failed");
        stakedOf[msg.sender] += amount;
        totalStaked += amount;
        _rewardDebt[msg.sender] = (stakedOf[msg.sender] * accFeePerShare) / PRECISION;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0 && stakedOf[msg.sender] >= amount, "vault: bad amount");
        _settle(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        _rewardDebt[msg.sender] = (stakedOf[msg.sender] * accFeePerShare) / PRECISION;
        require(cycle.transfer(msg.sender, amount), "vault: transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant returns (uint256 amount) {
        _settle(msg.sender);
        amount = _owed[msg.sender];
        require(amount > 0, "vault: nothing owed");
        _owed[msg.sender] = 0;
        require(cycle.transfer(msg.sender, amount), "vault: transfer failed");
        emit RewardsClaimed(msg.sender, amount);
    }

    function pendingRewards(address user) external view returns (uint256) {
        return _owed[user] + (stakedOf[user] * accFeePerShare) / PRECISION - _rewardDebt[user];
    }

    function _settle(address user) private {
        uint256 staked = stakedOf[user];
        if (staked > 0) {
            uint256 accrued = (staked * accFeePerShare) / PRECISION - _rewardDebt[user];
            if (accrued > 0) _owed[user] += accrued;
        }
        _rewardDebt[user] = (staked * accFeePerShare) / PRECISION;
    }
}
