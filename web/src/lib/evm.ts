import { formatEther } from "ethers";

/**
 * EVM wallet plumbing for Robinhood Chain — no adapter framework.
 *
 * Discovery is EIP-6963 (the multi-wallet announce protocol), so EVERY
 * injected wallet works — MetaMask, Rabby, Robinhood Wallet, Coinbase
 * Wallet, Brave, whatever announces itself — with `window.ethereum` as the
 * legacy fallback. Never hardcoded to one brand.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<any>;
}
export interface DetectedWallet {
  rdns: string;        // reverse-dns id (e.g. io.metamask, io.rabby)
  name: string;
  icon: string | null; // data: URI from the announce event
  provider: Eip1193Provider;
}

// ---- EIP-6963 discovery: listen from module load, collect every announce
const found = new Map<string, DetectedWallet>();
const discoveryListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event: any) => {
    const d = event?.detail;
    if (!d?.provider || !d?.info) return;
    found.set(String(d.info.rdns ?? d.info.uuid ?? d.info.name), {
      rdns: String(d.info.rdns ?? d.info.uuid ?? d.info.name),
      name: String(d.info.name ?? "Wallet"),
      icon: typeof d.info.icon === "string" ? d.info.icon : null,
      provider: d.provider,
    });
    discoveryListeners.forEach((f) => f());
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function detectWallets(): DetectedWallet[] {
  const list = [...found.values()];
  if (list.length === 0 && typeof window !== "undefined" && (window as any).ethereum) {
    // legacy single-injection fallback (pre-6963 wallets)