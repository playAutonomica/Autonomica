import { config as loadEnv } from "dotenv";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";

loadEnv({ path: path.resolve(__dirname, "../../arena/.env") });
const artifact = require("../artifacts/contracts/MultiStockSellExecutor.sol/MultiStockSellExecutor.json");
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const MAX_DEPLOY_GAS_ETH = parseEther("0.00075");
const MIN_ETH_RESERVE = parseEther("0.005");

async function main() {
  const live = process.argv.includes("--live");
  const key = process.env.AGENT_SECRET_1;
  if (!key) throw new Error("AGENT_SECRET_1 is required");
  const provider = new JsonRpcProvider(RPC);
  if ((await provider.getNetwork()).chainId !== 4663n) throw new Error("wrong chain");
  const wallet = new Wallet(key, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();
  const [gas, fees, balance] = await Promise.all([
    provider.estimateGas({ ...deployTx, from: wallet.address }),