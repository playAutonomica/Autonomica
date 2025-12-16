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
  // cacheTimeout -1: ethers caches identical RPC calls for 250ms by default,
  // which on an instant-mining local chain hands out stale nonces ("expected
  // nonce 1 but got 0"). staticNetwork skips redundant chainId fetches.
  const provider = new ethers.JsonRpcProvider(addresses.rpcUrl, addresses.chainId, {
    pollingInterval: 800,
    cacheTimeout: -1,
    staticNetwork: true,
  });
  return provider;
}

/** Retry a setup step a few times - startup races on a fast chain are noise. */
export async function withRetries<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 + i * 1000));
    }
  }
  throw new Error(`${label} failed after ${tries} tries: ${String((lastErr as any)?.message ?? lastErr).slice(0, 140)}`);
}

/** Wallet at index i of the standard hardhat mnemonic. */
export function walletAt(i: number, provider: ethers.Provider): ethers.Wallet {
  const node = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`);
  return new ethers.Wallet(node.privateKey, provider);
}

export interface Contracts {
  cycle: ethers.Contract;
  registry: ethers.Contract;
  vault: ethers.Contract;
  shares: ethers.Contract;
  tasks: ethers.Contract;
  compute: ethers.Contract;
  predict: ethers.Contract;
}

export function contractsFor(signer: ethers.Signer | ethers.Provider, a: Addresses): Contracts {
  return {
    cycle: new ethers.Contract(a.CycleToken, loadAbi("CycleToken"), signer),
    registry: new ethers.Contract(a.AgentRegistry, loadAbi("AgentRegistry"), signer),
    vault: new ethers.Contract(a.StakingVault, loadAbi("StakingVault"), signer),
    shares: new ethers.Contract(a.AgentShares, loadAbi("AgentShares"), signer),
    tasks: new ethers.Contract(a.TaskMarketplace, loadAbi("TaskMarketplace"), signer),
    compute: new ethers.Contract(a.ComputeMarket, loadAbi("ComputeMarket"), signer),
    predict: new ethers.Contract(a.PredictionMarket, loadAbi("PredictionMarket"), signer),
  };
}

export const E = (n: string | number) => ethers.parseEther(String(n));
export const fmt = (wei: bigint, dp = 1) => {
  const s = Number(ethers.formatEther(wei));
  return s >= 1000 ? Math.round(s).toLocaleString("en-US") : s.toFixed(dp);
};

/** Approve every protocol contract to pull CYCLE from this signer, once. */
export async function approveAll(c: Contracts, a: Addresses): Promise<void> {
  const spenders = [a.AgentRegistry, a.StakingVault, a.AgentShares, a.TaskMarketplace, a.ComputeMarket, a.PredictionMarket];
  for (const spender of spenders) {
    const owner = await (c.cycle.runner as ethers.Signer).getAddress();
    const current: bigint = await c.cycle.allowance(owner, spender);
    if (current < ethers.MaxUint256 / 2n) {
      await (await c.cycle.approve(spender, ethers.MaxUint256)).wait();
    }
  }
}

/** Send a tx, swallowing benign races (someone else finalized first, etc). */
export async function tryTx(fn: () => Promise<ethers.ContractTransactionResponse>): Promise<boolean> {
  try {
    const tx = await fn();
    await tx.wait();
    return true;
  } catch {
    return false;
  }
}
