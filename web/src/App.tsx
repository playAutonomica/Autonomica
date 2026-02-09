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
