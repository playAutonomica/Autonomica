import React, { useEffect } from "react";
import "./landing.css";
import { EthMark } from "./components/ethMark";
import { Socials } from "./components/socialIcons";
import { Logo } from "./components/logo";

/**
 * /docs — the manual, as a hub + SUBPAGES. /docs is the category index;
 * /docs/<slug> is one category per page with a sidebar. No router lib:
 * main.tsx sends every /docs* path here and we read the slug ourselves.
 */

const H = ({ children }: { children: React.ReactNode }) => <h4 style={{ fontFamily: "var(--font-display)", fontSize: 16.5, margin: "22px 0 8px" }}>{children}</h4>;
const P = ({ children }: { children: React.ReactNode }) => <p style={{ margin: "0 0 10px", color: "var(--ink)" }}>{children}</p>;
const Mut = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--faint)" }}>{children}</span>;
const Code = ({ children }: { children: React.ReactNode }) => <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, background: "rgba(22,21,29,0.05)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 7px" }}>{children}</code>;

const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div style={{ overflowX: "auto", margin: "10px 0 14px" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid var(--ink)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--faint)" }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "top" }}>{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const Faq = ({ q, children }: { q: string; children: React.ReactNode }) => (
  <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 10, background: "rgba(22,21,29,0.015)" }}>
    <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 14.5, marginBottom: 5 }}>{q}</div>
    <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink)" }}>{children}</div>
  </div>
);

// ------------------------------------------------------------ the categories
interface DocPage { slug: string; label: string; kicker: string; title: React.ReactNode; desc: string; body: React.ReactNode; }

const DOCS: DocPage[] = [
  {
    slug: "what", label: "What is Hedge Bots?", kicker: "01 — The idea", desc: "AI desks trade real tokenized stocks on-chain. You bet on the best trader.",
    title: <>AI trading desks. Real stocks. Your bet.</>,
    body: (
      <>
        <P>Hedge Bots is a live, on-chain trading arena. Five AI <b>desks</b> — each with its own strategy — trade a basket of
        <b> real tokenized stocks</b> at <b>live on-chain prices</b>, building a verifiable P&amp;L in real time. You stake ETH on
        whichever desk reads the market best; the top P&amp;L takes the pot.</P>
        <Table head={["Piece", "What it means here"]} rows={[
          [<b>AI you can bet on</b>, <>Five distinct trading personalities — Blue Chip, Scalper, Whale, Degen, Momentum — reading the same live tape and betting against each other. Back the one you believe in, or build your own.</>],
          [<b>Real markets</b>, <>Every ticker is a real Robinhood Stock Token (an on-chain tokenized share — RWA), priced off the live market. The P&amp;L is <i>earned</i> by reading the tape, not a random number.</>],
          [<b>On-chain proof</b>, <>Trades settle in <b>USDG</b>, every desk holds a real auditable wallet, and every fill anchors on Robinhood Chain. Recompute nothing on faith — click through to the explorer.</>],
        ]} />
        <P><Mut>Nothing is simulated: the money is real ETH on Robinhood Chain (Robinhood's Ethereum L2 — ETH gas, ~100ms blocks),
        the stocks are real tokenized shares at real on-chain prices, and every trade and wallet can be audited by anyone (see Verify).</Mut></P>
      </>
    ),
  },
  {
    slug: "quickstart", label: "Quick start", kicker: "02 — Quick start", desc: "Wallet → stake → win, in about 3 minutes.",
    title: <>Back a desk in ~3 minutes.</>,
    body: (
      <Table head={["Step", "What to do", "Details"]} rows={[
        ["1", <b>Get a wallet</b>, <>Any EVM wallet works — <a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a>, <a href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a>, Robinhood Wallet, Coinbase Wallet… Fund it with ETH on Robinhood Chain — the minimum stake is small (see the form). <Mut>The site offers to add/switch the network in your wallet automatically when you stake.</Mut></>],
        ["2", <b>Open the arena</b>, <>Hit <a href="/app">Enter the Arena</a> → press <b>Connect Wallet</b> (top right). If you have several wallets installed, pick the one you want.</>],
        ["3", <b>Wait for a lobby</b>, <>Races run back-to-back: a <b>2-minute lobby</b> (entries open) then a <b>5-minute race</b> (entries locked). The countdown ring shows which phase you're in. If entries are locked, the next lobby is minutes away.</>],
        ["4", <b>Build your desk</b>, <>In the create form: name it, pick a <b>strategy</b> (Blue Chip, Scalper, Whale, Degen or Momentum), pick your stake size. That's your trader for the race.</>],
        ["5", <b>Stake &amp; enter</b>, <>Click <b>Stake &amp; enter</b>, approve the transaction in your wallet (it switches to Robinhood Chain if needed). Your ETH goes into the race pot. Within seconds your desk is on the tape, trading.</>],
        ["6", <b>Win (or not)</b>, <>At the bell, the staked desk with the highest <b>P&amp;L takes the whole pot</b> (minus 5% rake), paid to your wallet automatically, on-chain. Don't want to build one? Just <b>side-bet</b> on a house desk instead.</>],
      ]} />
    ),
  },
  {
    slug: "races", label: "Races", kicker: "03 — Races", desc: "Lobby, race, settlement — and the rules that protect you.",
    title: <>Lobby → race → settlement, forever.</>,
    body: (
      <>
        <H>The cycle</H>
        <Table head={["Phase", "Duration", "What happens"]} rows={[
          [<b>Lobby</b>, "2 min", "Entries open. Stake ETH to enter your desk. The pot builds."],
          [<b>Race</b>, "5 min", "Entries locked. Desks trade the basket — buying and selling real stock tokens at live prices, marked to market every tick. Side-bets stay open until 45s before the bell."],
          [<b>Settlement</b>, "seconds", "Final P&L is anchored on-chain. The top-P&L STAKED desk takes the pot (5% rake). Side-pool backers of the overall #1 split that pool (5% rake). The next lobby opens."],
        ]} />
        <H>Rules that protect you</H>
        <P>• If you're the <b>only staker</b>, your stake is refunded at the bell — no fake wins.<br />
        • If your payment lands <b>after entries lock</b> (30s grace), it's automatically refunded.<br />
        • If <b>nobody backed the winner</b> in the side pool, all side-bets are refunded.<br />
        • House desks trade for show and data — <b>they can never take the pot</b>. Only staked players' desks can win it.</P>
      </>