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
    const eth = (window as any).ethereum;
    list.push({ rdns: "injected", name: eth.isRabby ? "Rabby" : eth.isMetaMask ? "MetaMask" : "Injected wallet", icon: null, provider: eth });
  }
  return list;
}
export function onWalletsChanged(f: () => void): () => void {
  discoveryListeners.add(f);
  return () => { discoveryListeners.delete(f); };
}

export async function connectEvmWallet(provider: Eip1193Provider): Promise<string> {
  const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
  const addr = accounts?.[0];
  if (!addr) throw new Error("wallet did not return an account");
  return addr;
}

/** The chain block served by the arena's /state — everything a wallet needs. */
export interface ArenaChain {
  chainId: number; chainIdHex: string; name: string;
  rpc: string; explorer: string; currency: string;
}

/** Make sure the wallet is on Robinhood Chain: switch, or add-then-switch. */
export async function ensureChain(provider: Eip1193Provider, chain: ArenaChain): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof current === "string" && parseInt(current, 16) === chain.chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainIdHex }] });
  } catch (e: any) {
    // 4902 = unknown chain → offer to add it, then it auto-switches
    if (e?.code === 4902 || /unrecognized|not.*added|4902/i.test(String(e?.message ?? ""))) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.chainIdHex,
          chainName: chain.name,
          nativeCurrency: { name: "Ether", symbol: chain.currency || "ETH", decimals: 18 },
          rpcUrls: [chain.rpc],
          blockExplorerUrls: chain.explorer ? [chain.explorer] : [],
        }],
      });
    } else throw e;