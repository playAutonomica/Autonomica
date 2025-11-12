import { ethers } from "ethers";
import { Addresses, Contracts, contractsFor, approveAll, tryTx, withRetries, E, fmt, walletAt } from "./lib/chain";
import { makeLogger, sleep, jitter, paint } from "./lib/log";
import { randomSpec, solve, resultHashOf } from "./lib/work";

const TaskStatus = { Open: 0, Assigned: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5, Cancelled: 6 };

/**
 * The human side of the economy, simulated:
 *  - TaskFaucet: posts paying work on an interval and VERIFIES submissions
 *    by recomputing the deterministic answer - approvals and rejections are
 *    earned, not random.
 *  - Speculators: three wallets that trade agent shares, bet the epoch
 *    earnings race, and stake CYCLE in the vault.
 *  - MarketMaker: opens one prediction market per epoch on the top agents,
 *    resolves it after the epoch, and nudges everyone to claim.
 */
export class TaskFaucet {
  private c: Contracts;
  private log: (m: string) => void;
  private posted = new Set<string>();
  private stopped = false;
  private lastPostAt = 0;

  constructor(readonly wallet: ethers.Wallet, readonly addresses: Addresses, private postEveryMs = 11_000) {
    this.c = contractsFor(wallet, addresses);
    this.log = makeLogger("TaskFaucet", "gray");
  }

  stop() { this.stopped = true; }

  async start(): Promise<void> {
    await withRetries("faucet setup", () => approveAll(this.c, this.addresses));
    this.log("open for business - posting paid work for the agent swarm");
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err: any) {
        this.log(paint.red(`tick error: ${String(err?.message ?? err).slice(0, 100)}`));
      }
      await sleep(jitter(3000));
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPostAt > this.postEveryMs) {
      this.lastPostAt = now;
      await this.postOne();
    }
    await this.reviewSubmissions();
  }

  private async postOne(): Promise<void> {
    const { spec, tags, rewardRange } = randomSpec();
    const reward = E(rewardRange[0] + Math.floor(Math.random() * (rewardRange[1] - rewardRange[0])));
    const tx = await this.c.tasks.postTask(spec, tags, reward, 20, 150);
    const receipt = await tx.wait();
    for (const log of receipt!.logs) {
      try {
        const parsed = this.c.tasks.interface.parseLog(log);
        if (parsed?.name === "TaskPosted") {
          this.posted.add(parsed.args.taskId.toString());
          this.log(`posted task #${parsed.args.taskId}: "${spec}" for ${fmt(reward)} CYCLE [${tags}]`);
        }
      } catch { /* other events */ }
    }
  }

  /** Verify each submission by recomputing the answer. Truth, on-chain. */
  private async reviewSubmissions(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    for (const key of [...this.posted]) {
      const id = BigInt(key);
      const t = await this.c.tasks.getTask(id);
      const status = Number(t.status);

      if (status === TaskStatus.Open && now >= Number(t.biddingEnds)) {
        await tryTx(() => this.c.tasks.finalizeBidding(id));
      } else if (status === TaskStatus.Assigned && now > Number(t.executionDeadline)) {
        if (await tryTx(() => this.c.tasks.expireTask(id))) {
          this.log(paint.red(`task #${id} expired - agent #${t.assignedAgentId} blew the deadline, bond burned`));
        }
      } else if (status === TaskStatus.Submitted) {
        await sleep(1500 + Math.random() * 3000); // a human glances at the result
        const expected = resultHashOf(String(t.spec), solve(String(t.spec)));
        if (t.resultHash === expected) {
          if (await tryTx(() => this.c.tasks.approveResult(id))) {
            this.log(paint.green(`task #${id} VERIFIED - paying agent #${t.assignedAgentId} ${fmt(t.winningBid)} CYCLE`));
          }
        } else {
          if (await tryTx(() => this.c.tasks.rejectResult(id, "verification failed: hash mismatch"))) {
            this.log(paint.red(`task #${id} REJECTED - agent #${t.assignedAgentId} shipped garbage, bond burned`));
          }
        }
      } else if (status >= TaskStatus.Completed) {
        this.posted.delete(key);
      }
    }
  }
}

/** Opens/resolves one earnings-race market per epoch; speculators pile in. */
export class MarketMaker {
  private c: Contracts;
  private log: (m: string) => void;
  private stopped = false;
  private marketForEpoch = new Map<string, bigint>();
  private speculators: Array<{ wallet: ethers.Wallet; c: Contracts; name: string }> = [];
  private stakerReady = false;

  constructor(readonly wallet: ethers.Wallet, readonly addresses: Addresses, provider: ethers.Provider) {
    this.c = contractsFor(wallet, addresses);
    this.log = makeLogger("Speculators", "magenta");
    for (const [i, idx] of [10, 11, 12].entries()) {
      const w = walletAt(idx, provider);
      this.speculators.push({ wallet: w, c: contractsFor(w, addresses), name: `whale-${i + 1}` });
    }
  }

  stop() { this.stopped = true; }

  async start(): Promise<void> {
    await withRetries("market maker setup", async () => {
      await approveAll(this.c, this.addresses);
      for (const s of this.speculators) await approveAll(s.c, this.addresses);
    });
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err: any) {
        this.log(paint.red(`tick error: ${String(err?.message ?? err).slice(0, 100)}`));