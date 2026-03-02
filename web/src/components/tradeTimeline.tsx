import React from "react";

/**
 * Live trade timeline — the desks' fills as they happen, newest first.
 * Wired to the arena's /state race.trades (the same tape the tabs use), each
 * row links to its on-chain receipt when anchored. Pure presentational: the
 * `trades` + `chain` come from the caller's live poll.
 */
const STRAT_COLOR: Record<string, string> = { balanced: "#2a78d6", undercut: "#1baf7a", premium: "#4a3aa7", memes: "#e87ba4", sniper: "#d97706" };

const timeAgo = (t: number) => {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

export function TradeTimeline({ trades, txBase, limit = 12 }: { trades: any[]; txBase?: string; limit?: number }) {
  const rows = (trades ?? []).slice(0, limit);
  if (!rows.length) {
    return <div style={{ color: "var(--faint)", fontFamily: "var(--font-mono)", fontSize: 13, padding: "22px 0" }}>the tape lights up the moment the market opens…</div>;
  }
  return (
    <div className="ss-timeline">
      {rows.map((f: any, i: number) => {
        const buy = f.side === "buy";
        const c = STRAT_COLOR[f.strategy] ?? "#2a78d6";
        return (
          <a
            key={`${f.t}-${i}`}
            className="ss-tl-row"