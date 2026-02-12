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