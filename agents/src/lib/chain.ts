import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

/** Chain plumbing: provider, demo wallets, contract handles. */

const GEN_DIR = path.join(__dirname, "..", "generated");
// local: the well-known hardhat mnemonic. Public networks: SWARM_MNEMONIC from
// agents/.env - NEVER run public with the hardhat phrase, those keys are public.
const MNEMONIC = process.env.SWARM_MNEMONIC
  ?? "test test test test test test test test test test test junk";

export interface Addresses {
  chainId: number;
  rpcUrl: string;
  epochGenesis: number;
  epochDuration: number;
  minAgentStake: string;
  minProviderStake: string;
  CycleToken: string;
  AgentRegistry: string;
  StakingVault: string;
  AgentShares: string;
  TaskMarketplace: string;
  ComputeMarket: string;
  PredictionMarket: string;
}

export function loadAddresses(): Addresses {
  const file = path.join(GEN_DIR, "addresses.json");
  if (!fs.existsSync(file)) {
    throw new Error(`missing ${file} - run the deploy first (npm run deploy:local in contracts/)`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadAbi(name: string): ethers.InterfaceAbi {
  return JSON.parse(fs.readFileSync(path.join(GEN_DIR, "abi", `${name}.json`), "utf8"));
}

export function makeProvider(addresses: Addresses): ethers.JsonRpcProvider {