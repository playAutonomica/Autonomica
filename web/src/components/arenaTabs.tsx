import React, { useEffect, useState } from "react";
import { useArena, useWallet, explorerTxUrl, BuildAgentForm, HouseWallets, RACES_API, fmtEth, fmtPnl } from "./computeArena";
import { EthMark } from "./ethMark";
import { payEntry } from "../lib/evm";

/**
 * The rest of the dashboard tabs — all backed by the real Robinhood Chain
 * arena service. Bounties, Compute, Speculate, Stake. Some are live-real,
 * some clearly-labelled mock, none break.
 */
function Spark({ pts }: { pts: number[] }) {
  if (!pts || pts.length < 2) return <span className="mut" style={{ fontSize: 10 }}>…</span>;
  const min = Math.min(...pts), max = Math.max(...pts), W = 96, H = 26;
  const up = pts[pts.length - 1] >= pts[0];
  const y = (v: number) => max === min ? H / 2 : H - 2 - ((v - min) / (max - min)) * (H - 4);
  const line = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const c = up ? "#00c805" : "#ff5000";
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={c} opacity="0.08" />
      <polyline points={line} fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W} cy={y(pts[pts.length - 1])} r="2.4" fill={c} />
    </svg>
  );
}

const STRAT_COLOR: Record<string, string> = { balanced: "#2a78d6", undercut: "#1baf7a", premium: "#4a3aa7", memes: "#e87ba4", sniper: "#d97706" };

// ---------------------------------------------------------------- The Tape
export function BountiesTab() {
  const { arena, offline } = useArena();
  if (offline || !arena) return <Offline />;
  const trades = arena.race?.trades ?? [];
  return (
    <div className="card">
      <h3>The tape — every fill on the floor <span className="hbar" /><span className="livedot" /></h3>
      <table>
        <thead><tr><th>Time</th><th>Agent</th><th>Side</th><th className="num">Qty</th><th>Stock</th><th className="num">Price</th><th className="num">Notional</th><th>Receipt</th></tr></thead>
        <tbody>
          {trades.map((f: any, i: number) => (
            <tr key={`${f.t}-${i}`}>
              <td className="mut" style={{ fontSize: 11 }}>{new Date(f.t).toISOString().slice(11, 19)}</td>
              <td><span className="dot" style={{ background: STRAT_COLOR[f.strategy] ?? "#2a78d6" }} /><span className="ink">{f.name}</span></td>
              <td style={{ color: f.side === "buy" ? "var(--good)" : "var(--critical)", fontWeight: 700, fontSize: 11.5 }}>{f.side.toUpperCase()}</td>
              <td className="num">{Number(f.qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
              <td className="ink" style={{ fontWeight: 600 }}>{f.sym}</td>
              <td className="num">${Number(f.px).toFixed(2)}</td>
              <td className="num mut">${Number(f.usd).toFixed(2)}</td>
              <td>{f.receiptTx ? <a href={explorerTxUrl(arena, f.receiptTx)} target="_blank" rel="noreferrer" style={{ color: "var(--violet)", fontFamily: "var(--font-mono)", fontSize: 11 }}>↗</a> : f.proven ? <span style={{ color: "var(--violet)", fontSize: 11 }}>✓🔒</span> : <span className="mut">…</span>}</td>
            </tr>
          ))}
          {trades.length === 0 && <tr><td colSpan={8} className="mut" style={{ padding: 14 }}>the tape prints the moment the race starts…</td></tr>}
        </tbody>
      </table>
      <div className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
        Every row is a confirmed wallet swap at the live Robinhood Stock Token price; click its transaction to verify it.
        <span className="ink"> Post-your-own trading bounties: coming soon.</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Compute
export function ComputeTab() {
  const { arena, offline } = useArena();
  if (offline || !arena) return <Offline />;
  const stocks = arena.market?.stocks ?? [];
  const holders = (sym: string) => (arena.race?.agents ?? []).filter((a: any) => a.funded && (a.positions ?? []).some((p: any) => p.sym === sym)).map((a: any) => a.name);
  return (
    <>
      <div className="card">
        <h3>The market — real Robinhood Stock Tokens, priced live <span className="hbar" /><span className="mono" style={{ letterSpacing: 0, color: arena.market?.live ? "var(--good)" : "var(--warning)", fontSize: 11 }}>{arena.market?.live ? "LIVE · on-chain 24/7" : "feed reconnecting…"}</span></h3>
        <table>
          <thead><tr><th>Stock</th><th>Chart</th><th className="num">Price</th><th className="num">3m move</th><th className="num">24h volume</th><th>Held by</th><th>Contract</th></tr></thead>
          <tbody>
            {stocks.map((st: any) => (
              <tr key={st.sym}>
                <td><span className="ink" style={{ fontWeight: 600 }}>{st.sym}</span> <span className="mut" style={{ fontSize: 11 }}>{st.name}</span>{st.kind === "private" && <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--warning)", background: "rgba(217,119,6,0.1)", borderRadius: 5, padding: "1px 6px" }}>PRIVATE·SPV</span>}</td>
                <td><Spark pts={st.spark} /></td>
                <td className="num ink">{st.usd ? `${Number(st.usd).toFixed(2)}` : "…"}</td>
                <td className="num" style={{ color: st.move3m >= 0 ? "var(--good)" : "var(--critical)" }}>{st.move3m >= 0 ? "+" : ""}{st.move3m}%</td>
                <td className="num mut">${(Number(st.vol24hUsd) / 1e6).toFixed(2)}M</td>
                <td className="mut" style={{ fontSize: 11 }}>{holders(st.sym).join(", ") || "—"}</td>
                <td><a href={st.url} target="_blank" rel="noreferrer" style={{ color: "var(--violet)", fontFamily: "var(--font-mono)", fontSize: 10.5, textDecoration: "none" }}>{st.token.slice(0, 8)}… ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>
          Every row is a real tokenized stock issued by Robinhood on Robinhood Chain — backed 1:1 by custodied shares,
          trading 24/7. Click any contract to audit it on Blockscout. <b className="ink">SpaceX is an SPV wrapper</b>, not direct equity.
        </div>
      </div>
      <HouseWallets />
    </>
  );
}

// --------------------------------------------------------------- Speculate
export function SpeculateTab() {
  const { arena, offline } = useArena();
  const { wallet } = useWallet();
  const [msg, setMsg] = useState<string | null>(null);
  const [, tick] = useState(0); // 1s heartbeat so the cutoff flips live, not on the 4s poll
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (offline || !arena) return <Offline />;
  const now = Date.now();
  const betsOpen = arena.race ? now < arena.race.sideBetCutoff : false;
  const secsToCutoff = arena.race ? Math.max(0, Math.floor((arena.race.sideBetCutoff - now) / 1000)) : 0;
  const ranked = arena.race ? [...arena.race.agents].filter((a: any) => a.funded).sort((a: any, b: any) => b.credits - a.credits) : [];

  async function back(agentId: string, agentName: string) {
    if (!wallet) { setMsg("connect your wallet (top right) to back an agent"); return; }
    try {
      setMsg(`opening a bet on ${agentName}…`);
      const res = await fetch(`${RACES_API}/bet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId, owner: wallet.address }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg(`approve the ${arena.minSideBetEth} ETH bet in ${wallet.name}…`);
      const tx = await payEntry(arena.chain, wallet.provider, wallet.address, data.depositAddress, data.minWeiHex);
      setMsg(`bet placed on ${agentName} (${tx.slice(0, 12)}…) — if it finishes #1 you split the side pool`);
    } catch (e: any) { setMsg(String(e?.message ?? e).slice(0, 140)); }