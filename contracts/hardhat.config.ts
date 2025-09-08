import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// public-network deploys sign with this key (never the well-known hardhat ones)
const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
const ROBINHOOD_FORK_URL = process.env.ROBINHOOD_FORK_URL;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
      // demo runs in real time; allow timestamps to drift naturally
      allowBlocksWithSameTimestamp: true,
      ...(ROBINHOOD_FORK_URL ? { forking: { url: ROBINHOOD_FORK_URL } } : {}),
      chains: {
        // Robinhood Chain is an Arbitrum Orbit chain. Hardhat needs an explicit
        // history entry to execute calls against a fork of an unknown chain id.
        4663: { hardforkHistory: { shanghai: 0, cancun: 0 } },
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",