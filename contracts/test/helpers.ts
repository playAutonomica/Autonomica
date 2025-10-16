import { ethers } from "hardhat";

export const E = (n: string | number) => ethers.parseEther(String(n));
export const EPOCH_DURATION = 3600n; // 1h epochs in tests
export const MIN_AGENT_STAKE = E(100);
export const MIN_PROVIDER_STAKE = E(500);
export const CURVE_DIVISOR = 40n;

/// Deploys the full protocol, wires authorizations, and funds ten actors
/// with 1M CYCLE each (all pre-approved to every protocol contract so tests
/// read as pure economics).
export async function deployProtocol() {
  const signers = await ethers.getSigners();
  const [deployer, poster, agentOwner, agentWallet1, agentWallet2, agentWallet3, providerAcct, speculator1, speculator2, staker] = signers;

  const cycle = await (await ethers.getContractFactory("CycleToken")).deploy();
  const registry = await (await ethers.getContractFactory("AgentRegistry")).deploy(
    cycle, EPOCH_DURATION, MIN_AGENT_STAKE
  );
  const vault = await (await ethers.getContractFactory("StakingVault")).deploy(cycle);
  const shares = await (await ethers.getContractFactory("AgentShares")).deploy(
    cycle, registry, vault, CURVE_DIVISOR
  );
  const tasks = await (await ethers.getContractFactory("TaskMarketplace")).deploy(
    cycle, registry, shares, vault
  );
  const compute = await (await ethers.getContractFactory("ComputeMarket")).deploy(
    cycle, registry, vault, MIN_PROVIDER_STAKE
  );
  const predict = await (await ethers.getContractFactory("PredictionMarket")).deploy(
    cycle, registry, vault