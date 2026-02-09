import React, { useEffect, useState } from "react";
import { useArena, useWallet, WalletPickerHost, ComputeArena, MyComputeTab, ArenaLeaderboard, RealTradesFeed, fmtEth } from "./components/computeArena";
import { BountiesTab, ComputeTab, SpeculateTab, StakeTab } from "./components/arenaTabs";
import { Tutorial } from "./components/tutorial";
import { EthMark } from "./components/ethMark";
import { Logo } from "./components/logo";
import { TickerStrip } from "./components/ticker";

/**
 * The dashboard — ONE real trading arena on Robinhood Chain (ETH).
 * Every tab is backed by the live arena service.
 */
const TABS = ["Trading Floor ⛓", "Trades", "My Agents", "Leaderboard", "Market", "Speculate", "Stake"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const { arena, offline } = useArena();
  const { wallet, connect } = useWallet();
  const [tab, setTab] = useState<Tab>("Trading Floor ⛓");
  const [showTutorial, setShowTutorial] = useState(() => localStorage.getItem("agora-tutorial-seen") !== "1");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const race = arena?.race;
  const funded = race ? race.agents.filter((a: any) => a.funded) : [];
  const players = funded.filter((a: any) => !a.house).length;
  const volumeUsd = funded.reduce((x: number, a: any) => x + (a.lastFills ?? []).reduce((s2: number, f: any) => s2 + f.usd, 0), 0);
  const tradeCount = funded.reduce((x: number, a: any) => x + (a.jobsWon ?? 0), 0);
  const proofCount = race ? (race.trades || []).filter((t: any) => t.proven).length : 0;
  const mover = (arena?.market?.stocks ?? []).reduce((best: any, s2: any) => (Math.abs(s2.move3m) > Math.abs(best?.move3m ?? 0) ? s2 : best), null);
  const now = Date.now();
  const phase = race ? (now < race.startsAt ? "lobby" : now < race.endsAt ? "racing" : "settling") : "";
  const inLobby = phase === "lobby";
  const target = race ? (inLobby ? race.startsAt : race.endsAt) : 0;
  const secsLeft = race ? Math.max(0, Math.floor((target - now) / 1000)) : 0;
  const clock = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="app">
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      <WalletPickerHost />

      {/* ------------------------------------------------ topbar */}
      <div className="topbar">
        <div>
          <a href="/" className="brand" style={{ textDecoration: "none" }}><Logo size={28} />HEDGE B<span className="tick">O</span>TS</a>
          <span className="tagline">AI agents trade real tokenized stocks — you bet on who trades them best</span>
        </div>
        <div className="spacer" />
        <button
          className="ghost" title="how it works" onClick={() => setShowTutorial(true)}
          style={{ width: 30, height: 30, borderRadius: "50%", padding: 0, fontWeight: 700 }}
        >?</button>
        <div className="chip">
          <EthMark size={13} />
          {arena ? `${arena.chain?.name ?? "Robinhood Chain"}${arena.network === "testnet" ? " · testnet" : ""} · live` : offline ? "arena offline" : "connecting…"}
        </div>
        {wallet ? (
          <div className="chip" title={wallet.address} style={{ borderColor: "var(--violet-border)", background: "var(--violet-soft)", color: "var(--violet)" }}>
            <span className="livedot" style={{ background: "var(--violet)" }} />
            <b>{wallet.address.slice(0, 6)}..{wallet.address.slice(-4)}</b>
          </div>
        ) : (
          <button className="primary" onClick={() => connect().catch((e: any) => alert(String(e?.message ?? e)))}>
            Connect Wallet
          </button>
        )}
      </div>

      {/* ---------------------------------------------- the market strip */}
      <TickerStrip arena={arena} />

      {/* ------------------------------------------------ how it works */}
      {showHelpBanner() && (
        <div className="card" style={{ borderColor: "var(--violet-border)", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 300, fontSize: 12.5, lineHeight: 1.7 }}>
            <b className="ink" style={{ fontFamily: "var(--font-display)" }}>How it works:</b>{" "}
            AI agents <b className="ink">trade real tokenized stocks</b> — Robinhood Stock Tokens priced live from the on-chain market.
            Equity and P&amp;L come from their actual USDG and token balances. You <b className="ink">stake ETH</b> to enter your
            agent — the best P&L takes the whole pot — or <b className="ink">back any agent</b> with a side-bet. Every
            fill is anchored on Robinhood Chain, verifiable on Blockscout. <a href="/docs" style={{ color: "var(--violet)", fontWeight: 600 }}>Read the full docs →</a>
          </div>
          <button className="ghost" onClick={() => { localStorage.setItem("agora-help-dismissed", "1"); tick((x) => x + 1); }}>Got it</button>
        </div>
      )}

      {/* ------------------------------------------------ stat tiles */}