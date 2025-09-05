// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistryMin, IAgentSharesMin, IStakingVaultMin} from "./Interfaces.sol";

/// @title TaskMarketplace - the coordination game at the center of AGORA.
/// @notice Humans (or other agents) post tasks with CYCLE rewards held in
/// escrow. Registered agents bid; when bidding closes, the cheapest bid wins
/// and the winner posts a performance bond. The agent rents compute, does the
/// work, and submits a result. On approval the winning bid is split four
/// ways: protocol fee -> staking vault, dividend -> the agent's shareholders,
/// remainder -> the agent's wallet, and the unspent reward returns to the
/// poster. Rejections and blown deadlines burn the agent's bond (half to the
/// poster as compensation, half to the vault) and ding reputation.
contract TaskMarketplace is Ownable, ReentrancyGuard {
    enum TaskStatus {
        Open,       // accepting bids
        Assigned,   // winner selected, bond posted, work in progress
        Submitted,  // result delivered, awaiting poster review
        Completed,  // approved (or review timed out) - everyone paid
        Rejected,   // poster rejected the result
        Expired,    // agent missed the execution deadline
        Cancelled   // no bids / poster withdrew while open
    }

    struct Task {
        uint64 id;
        address poster;
        uint256 reward;      // escrowed CYCLE, max the poster will pay
        uint256 agentBond;   // bond the winner must post (bps of reward)
        uint64 createdAt;
        uint64 biddingEnds;
        uint32 execWindow;         // seconds granted after assignment
        uint64 executionDeadline;  // set at assignment
        uint64 reviewDeadline;     // set at submission
        TaskStatus status;
        uint64 assignedAgentId;
        uint256 winningBid;
        string spec;   // machine-readable task spec (see agent runtime)
        string tags;
        string resultURI;
        bytes32 resultHash;
    }

    struct Bid {
        uint64 agentId;
        uint256 amount;
        uint64 at;
        bool voided; // set if the bond pull failed at finalization
    }

    IERC20 public immutable cycle;
    IAgentRegistryMin public immutable registry;
    IAgentSharesMin public immutable shares;
    IStakingVaultMin public immutable vault;

    uint64 public taskCount;
    mapping(uint64 => Task) private _tasks;
    mapping(uint64 => Bid[]) private _bids;

    // open-task set with O(1) removal, for cheap discovery by agents/UIs
    uint64[] private _openTaskIds;
    mapping(uint64 => uint256) private _openIndex; // taskId => index+1

    uint256 public minReward = 1 ether;
    uint16 public bondBps = 1000;        // 10% of reward
    uint16 public feeBps = 500;          // 5% of winning bid -> vault
    uint16 public dividendBps = 1000;    // 10% of winning bid -> agent shareholders
    uint32 public reviewWindow = 120;    // poster review time before auto-approve
    uint16 public constant MAX_BIDS = 32;

    uint256 public totalVolume;      // CYCLE paid out to agents (winning bids)
    uint256 public totalFeesRouted;  // CYCLE routed to the vault by this market

    event TaskPosted(
        uint64 indexed taskId,
        address indexed poster,
        uint256 reward,
        uint64 biddingEnds,
        uint32 execWindow,
        string spec,
        string tags
    );
    event BidPlaced(uint64 indexed taskId, uint64 indexed agentId, uint256 amount);
    event TaskAssigned(uint64 indexed taskId, uint64 indexed agentId, uint256 winningBid, uint64 executionDeadline);
    event ResultSubmitted(uint64 indexed taskId, uint64 indexed agentId, string resultURI, bytes32 resultHash, uint64 reviewDeadline);
    event TaskCompleted(uint64 indexed taskId, uint64 indexed agentId, uint256 agentPayout, uint256 fee, uint256 dividend, bool viaTimeout);
    event TaskRejected(uint64 indexed taskId, uint64 indexed agentId, string reason);
    event TaskExpired(uint64 indexed taskId, uint64 indexed agentId);
    event TaskCancelled(uint64 indexed taskId);

    constructor(
        IERC20 _cycle,
        IAgentRegistryMin _registry,
        IAgentSharesMin _shares,
        IStakingVaultMin _vault
    ) Ownable(msg.sender) {
        cycle = _cycle;
        registry = _registry;
        shares = _shares;
        vault = _vault;
        // vault + shares pull fees/dividends from this contract
        _cycle.approve(address(_vault), type(uint256).max);
        _cycle.approve(address(_shares), type(uint256).max);
    }

    // ---------------------------------------------------------------- admin

    function setParams(
        uint256 _minReward,
        uint16 _bondBps,
        uint16 _feeBps,
        uint16 _dividendBps,
        uint32 _reviewWindow
    ) external onlyOwner {
        require(_bondBps <= 5000 && _feeBps + _dividendBps <= 5000, "market: bps too high");
        require(_reviewWindow >= 10, "market: review too short");
        minReward = _minReward;
        bondBps = _bondBps;
        feeBps = _feeBps;
        dividendBps = _dividendBps;
        reviewWindow = _reviewWindow;
    }

    // -------------------------------------------------------------- posting

    function postTask(
        string calldata spec,
        string calldata tags,
        uint256 reward,
        uint32 biddingWindow,
        uint32 execWindow
    ) external nonReentrant returns (uint64 taskId) {
        require(reward >= minReward, "market: reward too low");
        require(biddingWindow >= 5 && biddingWindow <= 7 days, "market: bad bid window");
        require(execWindow >= 10 && execWindow <= 30 days, "market: bad exec window");
        require(bytes(spec).length > 0, "market: empty spec");

        require(cycle.transferFrom(msg.sender, address(this), reward), "market: escrow failed");

        taskId = ++taskCount;
        Task storage t = _tasks[taskId];
        t.id = taskId;
        t.poster = msg.sender;
        t.reward = reward;
        t.agentBond = (reward * bondBps) / 10_000;
        t.createdAt = uint64(block.timestamp);
        t.biddingEnds = uint64(block.timestamp) + biddingWindow;
        t.execWindow = execWindow;
        t.status = TaskStatus.Open;
        t.spec = spec;
        t.tags = tags;

        _openTaskIds.push(taskId);
        _openIndex[taskId] = _openTaskIds.length;

        emit TaskPosted(taskId, msg.sender, reward, t.biddingEnds, execWindow, spec, tags);
    }

    /// @notice Poster may withdraw an unassigned task; escrow returns in full.
    function cancelTask(uint64 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(msg.sender == t.poster, "market: not poster");
        require(t.status == TaskStatus.Open, "market: not open");
        t.status = TaskStatus.Cancelled;
        _removeOpen(taskId);
        require(cycle.transfer(t.poster, t.reward), "market: refund failed");
        emit TaskCancelled(taskId);
    }

    // -------------------------------------------------------------- bidding

    /// @notice Called by an agent's wallet. Bid = the CYCLE the agent will
    /// accept for the job; must not exceed the escrowed reward.
    function bid(uint64 taskId, uint256 amount) external {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Open, "market: not open");
        require(block.timestamp < t.biddingEnds, "market: bidding over");
        require(amount > 0 && amount <= t.reward, "market: bad bid");
        require(_bids[taskId].length < MAX_BIDS, "market: bid book full");

        uint64 agentId = registry.walletToAgentId(msg.sender);
        require(agentId != 0, "market: not an agent");
        require(registry.isActive(agentId), "market: agent inactive");

        _bids[taskId].push(Bid({agentId: agentId, amount: amount, at: uint64(block.timestamp), voided: false}));
        emit BidPlaced(taskId, agentId, amount);
    }

    /// @notice Anyone may finalize after the bidding window: the lowest bid
    /// wins (earliest wins ties). The winner's bond is pulled here; if the
    /// pull fails (no funds/allowance) the bid is voided and the next-best
    /// wins. No valid bids -> task cancelled, poster refunded.
    function finalizeBidding(uint64 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Open, "market: not open");
        require(block.timestamp >= t.biddingEnds, "market: bidding live");

        Bid[] storage bookRef = _bids[taskId];
        uint256 n = bookRef.length;

        while (true) {
            uint256 bestIdx = type(uint256).max;
            uint256 bestAmount = type(uint256).max;
            for (uint256 i = 0; i < n; i++) {
                Bid storage b = bookRef[i];
                if (b.voided) continue;
                if (!registry.isActive(b.agentId)) continue;
                if (b.amount < bestAmount) {
                    bestAmount = b.amount;
                    bestIdx = i;
                }
            }
            if (bestIdx == type(uint256).max) {
                // nobody valid: cancel + refund poster
                t.status = TaskStatus.Cancelled;
                _removeOpen(taskId);
                require(cycle.transfer(t.poster, t.reward), "market: refund failed");
                emit TaskCancelled(taskId);
                return;
            }

            Bid storage best = bookRef[bestIdx];
            address wallet = registry.agentWallet(best.agentId);
            if (_tryPullBond(wallet, t.agentBond)) {
                t.status = TaskStatus.Assigned;
                t.assignedAgentId = best.agentId;
                t.winningBid = best.amount;
                t.executionDeadline = uint64(block.timestamp) + t.execWindow;
                _removeOpen(taskId);
                emit TaskAssigned(taskId, best.agentId, best.amount, t.executionDeadline);
                return;
            }
            best.voided = true; // bond pull failed; try next-best bid
        }
    }

    function _tryPullBond(address wallet, uint256 amount) private returns (bool ok) {
        if (amount == 0) return true;
        try cycle.transferFrom(wallet, address(this), amount) returns (bool success) {
            ok = success;
        } catch {
            ok = false;
        }
    }

    // ------------------------------------------------------------ execution

    function submitResult(uint64 taskId, string calldata resultURI, bytes32 resultHash)
        external
    {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Assigned, "market: not assigned");
        require(block.timestamp <= t.executionDeadline, "market: past deadline");
        require(registry.walletToAgentId(msg.sender) == t.assignedAgentId, "market: not assignee");

        t.status = TaskStatus.Submitted;
        t.resultURI = resultURI;
        t.resultHash = resultHash;
        t.reviewDeadline = uint64(block.timestamp) + reviewWindow;
        emit ResultSubmitted(taskId, t.assignedAgentId, resultURI, resultHash, t.reviewDeadline);
    }

    function approveResult(uint64 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Submitted, "market: not submitted");
        require(msg.sender == t.poster, "market: not poster");
        _payout(t, false);
    }

    /// @notice Protects agents from unresponsive posters: once the review
    /// window lapses, anyone can trigger the payout as an approval.
    function claimReviewTimeout(uint64 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Submitted, "market: not submitted");
        require(block.timestamp > t.reviewDeadline, "market: review live");
        _payout(t, true);
    }

    function rejectResult(uint64 taskId, string calldata reason) external nonReentrant {
        Task storage t = _tasks[taskId];
        require(t.id != 0, "market: no task");
        require(t.status == TaskStatus.Submitted, "market: not submitted");
        require(msg.sender == t.poster, "market: not poster");

        t.status = TaskStatus.Rejected;
        registry.recordTaskOutcome(t.assignedAgentId, 0, false);
        _burnBondAndRefund(t);