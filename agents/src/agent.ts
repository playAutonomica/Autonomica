import { ethers } from "ethers";
import { Addresses, Contracts, contractsFor, approveAll, tryTx, withRetries, E, fmt } from "./lib/chain";
import { makeLogger, sleep, jitter, paint } from "./lib/log";
import { solve, resultHashOf, computeNeed } from "./lib/work";
import { Persona, childPersona } from "./personas";
import { getHostProvider } from "./host-provider";

const TaskStatus = { Open: 0, Assigned: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5, Cancelled: 6 };

/**
 * An autonomous economic agent. One wallet, one on-chain identity, one loop:
 *   scan the task board -> evaluate against strategy -> bid ->
 *   win -> rent raw compute -> do the work -> submit the result ->
 *   get paid (or slashed) -> compound -> maybe spawn a child agent.
 * Everything it does is a real transaction against the protocol.
 */
export class AgentRunner {
  readonly wallet: ethers.Wallet;
  readonly c: Contracts;
  private log: (m: string) => void;
  agentId = 0n;
  private myBids = new Set<string>();     // taskIds I have bid on, still live
  private inFlight = new Set<string>();   // taskIds currently being worked
  private childrenSpawned = 0;
  private stopped = false;
  profitPaid = 0n;

  // one wallet, many concurrent flows (main loop + detached task execution):
  // serialize every tx send so nonces never race
  private txChain: Promise<unknown> = Promise.resolve();
  private tx<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.txChain.then(fn, fn);
    this.txChain = p.then(() => undefined, () => undefined);
    return p;
  }
  private send(fn: () => Promise<ethers.ContractTransactionResponse>): Promise<boolean> {
    return this.tx(() => tryTx(fn));
  }

  constructor(
    readonly persona: Persona,
    wallet: ethers.Wallet,
    readonly addresses: Addresses,
    private onSpawn?: (child: AgentRunner) => void,
  ) {
    this.wallet = wallet;
    this.c = contractsFor(wallet, addresses);
    this.log = makeLogger(persona.name, persona.color);
  }

  stop() { this.stopped = true; }

  async start(): Promise<void> {
    await withRetries(`${this.persona.name} setup`, () => this.ensureRegistered());
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (err: any) {
        this.log(paint.red(`tick error: ${String(err?.message ?? err).slice(0, 120)}`));
      }
      await sleep(jitter(3500));
    }
  }

  private async ensureRegistered(): Promise<void> {
    await approveAll(this.c, this.addresses);
    this.agentId = await this.c.registry.walletToAgentId(this.wallet.address);
    if (this.agentId === 0n) {
      await (await this.c.registry.registerAgent(
        this.wallet.address, this.persona.name, this.persona.goal, ""
      )).wait();
      this.agentId = await this.c.registry.walletToAgentId(this.wallet.address);