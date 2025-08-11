// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentSharesMin, IStakingVaultMin} from "./Interfaces.sol";

/// @title AgentRegistry - on-chain identity, stake, reputation and P&L ledger
/// for autonomous agents.
/// @notice Anyone (a human EOA *or another agent's wallet*) can register an
/// agent by staking CYCLE. When the registrant is itself a registered agent
/// wallet, the new agent records it as its parent - agents spawning
/// sub-agents is a first-class primitive.
///
/// Market contracts (task marketplace, compute market) are authorized to
/// write outcomes: earnings roll up per-epoch (feeding trustless prediction
/// market resolution), reputation moves on success/failure, and misbehaving
/// agents get their stake slashed into the staking vault.
contract AgentRegistry is Ownable, ReentrancyGuard {
    struct Agent {
        uint64 id;
        address owner;   // registrant: human EOA or parent agent's wallet
        address wallet;  // the agent's operational signer (bids, submits, spends)
        uint64 parentId; // 0 for root agents
        uint64 registeredAt;
        bool active;
        string name;
        string goal;
        string metadataURI;
        uint256 stake;
        int256 reputation; // starts at 100, clamped to [0, 1000]
        uint256 lifetimeEarnings;
        uint256 lifetimeComputeSpend;
        uint64 tasksCompleted;
        uint64 tasksFailed;
    }

    IERC20 public immutable cycle;

    uint64 public agentCount;
    mapping(uint64 => Agent) private _agents;
    mapping(address => uint64) public walletToAgentId;

    // epoch => agentId => gross CYCLE earned from completed tasks
    mapping(uint64 => mapping(uint64 => uint256)) public epochEarnings;
    // epoch => total gross CYCLE earned across all agents
    mapping(uint64 => uint256) public epochTotalEarnings;

    uint64 public immutable epochGenesis;
    uint64 public epochDuration; // seconds

    // ---- permadeath: every season the weakest active agent is liquidated
    uint64 public seasonLength = 3;   // epochs per season
    uint64 public lastReapedSeason;   // stores (reaped season + 1); 0 = never

    uint256 public minAgentStake;
    int256 public constant REP_START = 100;
    int256 public constant REP_MAX = 1000;
    int256 public constant REP_SUCCESS_DELTA = 10;
    int256 public constant REP_FAIL_DELTA = -50;

    mapping(address => bool) public authorizedMarkets;
    IAgentSharesMin public shares;
    IStakingVaultMin public vault;

    uint256 public totalStaked;
    uint256 public totalSlashed;

    event AgentRegistered(
        uint64 indexed agentId,
        address indexed owner,
        address indexed wallet,
        uint64 parentId,
        string name,
        string goal,
        uint256 stake
    );
    event AgentDeactivated(uint64 indexed agentId);
    event StakeWithdrawn(uint64 indexed agentId, address indexed to, uint256 amount);
    event TaskOutcomeRecorded(
        uint64 indexed agentId,
        uint64 indexed epoch,
        uint256 grossEarned,
        bool success,
        int256 newReputation
    );
    event ComputeSpendRecorded(uint64 indexed agentId, uint256 amount);
    event StakeSlashed(uint64 indexed agentId, uint256 amount, string reason);
    event MarketAuthorized(address indexed market, bool authorized);
    event EpochDurationSet(uint64 duration);
    event AgentLiquidated(
        uint64 indexed agentId,
        uint64 indexed season,
        uint256 seasonEarnings,
        uint256 stakeBurned,