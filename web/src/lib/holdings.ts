import { JsonRpcProvider, Contract, formatEther, formatUnits } from "ethers";

/**
 * REAL wallet holdings — read straight off Robinhood Chain via RPC balanceOf.
 * The agent's actual ETH, USDG, and Robinhood Stock Tokens, marked at live
 * prices. This is the genuine on-chain equity, not the paper race book.
 */
const provider = new JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com");
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const BAL = ["function balanceOf(address) view returns (uint256)"];

export const STOCKS: Record<string, string> = {
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  TSLA: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
  COIN: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
  AMZN: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
  MSFT: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
  SPY: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
  SPCX: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
  AMD: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
  MU: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
  META: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
  GOOGL: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
};

export interface Holdings {
  eth: number;
  usdg: number;