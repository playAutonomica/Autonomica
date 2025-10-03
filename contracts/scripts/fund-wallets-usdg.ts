import { config as loadEnv } from "dotenv";
import path from "node:path";
import { AbiCoder, Contract, Interface, JsonRpcProvider, Wallet, formatEther, formatUnits, parseEther, parseUnits } from "ethers";

loadEnv({ path: path.resolve(__dirname, "../../arena/.env") });

const RPC = process.env.FUND_RPC ?? "https://rpc.mainnet.chain.robinhood.com";
const ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
const QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
const ETH = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const TARGET = parseUnits("5", 6);
const MIN_ETH_RESERVE = parseEther("0.005");
const MAX_GAS_ETH = parseEther("0.0002");
const KEY = { currency0: ETH, currency1: USDG, fee: 460, tickSpacing: 9, hooks: ETH };
const coder = AbiCoder.defaultAbiCoder();
const POOL_KEY = "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const PATH_KEY = "tuple(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)";
const EXACT_IN = `tuple(address currencyIn,${PATH_KEY}[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)`;
const QUOTER_ABI = [`function quoteExactInputSingle(tuple(${POOL_KEY} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`];
const ERC20_ABI = ["function balanceOf(address) view returns(uint256)"];
const router = new Interface(["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"]);

async function quote(q: Contract, amount: bigint): Promise<bigint> {
  const [out] = await q.quoteExactInputSingle.staticCall({ poolKey: KEY, zeroForOne: true, exactAmount: amount, hookData: "0x" });
  return out;
}

function calldata(wallet: string, amountIn: bigint, minOut: bigint): string {
  const swap = coder.encode([EXACT_IN], [{
    currencyIn: ETH,
    path: [{ intermediateCurrency: USDG, fee: 460, tickSpacing: 9, hooks: ETH, hookData: "0x" }],
    minHopPriceX36: [], amountIn, amountOutMinimum: minOut,
  }]);
  const settle = coder.encode(["address", "uint256", "bool"], [ETH, amountIn, true]);
  const take = coder.encode(["address", "address", "uint256"], [USDG, wallet, 0]);
  const input = coder.encode(["bytes", "bytes[]"], ["0x070b0e", [swap, settle, take]]);
  return router.encodeFunctionData("execute", ["0x10", [input], Math.floor(Date.now() / 1000) + 300]);
}

async function main() {
  const live = process.argv.includes("--live");
  const provider = new JsonRpcProvider(RPC);
  const chainId = (await provider.getNetwork()).chainId;
  if (chainId !== 4663n && chainId !== 31337n) throw new Error(`refusing chain ${chainId}`);
  const wallets = Array.from({ length: 5 }, (_, i) => {
    const key = process.env[`AGENT_SECRET_${i + 1}`];
    if (!key) throw new Error(`AGENT_SECRET_${i + 1} is required`);
    return new Wallet(key, provider);
  });
  const token = new Contract(USDG, ERC20_ABI, provider);
  const quoter = new Contract(QUOTER, QUOTER_ABI, provider);
  const sampleIn = parseEther("0.001");
  const sampleOut = await quote(quoter, sampleIn);
  const plans: Array<{ wallet: Wallet; before: bigint; deficit: bigint; ethIn: bigint; quoted: bigint; data: string; gas: bigint }> = [];

  for (const wallet of wallets) {
    const [before, ethBalance] = await Promise.all([token.balanceOf(wallet.address), provider.getBalance(wallet.address)]);
    if (before >= TARGET) continue;
    const deficit = TARGET - before;
    const desiredQuote = (deficit * 10_075n) / 10_000n; // 0.75% execution buffer
    let ethIn = (sampleIn * desiredQuote + sampleOut - 1n) / sampleOut;
    let quoted = await quote(quoter, ethIn);
    for (let i = 0; i < 3 && quoted < desiredQuote; i++) {
      ethIn = (ethIn * desiredQuote + quoted - 1n) / quoted;
      quoted = await quote(quoter, ethIn);
    }
    if (quoted < desiredQuote) throw new Error(`unable to quote target for ${wallet.address}`);
    const data = calldata(wallet.address, ethIn, deficit);
    const gas = await provider.estimateGas({ from: wallet.address, to: ROUTER, data, value: ethIn });
    const fees = await provider.getFeeData();