import { expect } from "chai";
import { ethers } from "hardhat";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(__dirname, "../../arena/.env") });

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
const STOCKS = [
  ["NVDA", "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"],
  ["TSLA", "0x322F0929c4625eD5bAd873c95208D54E1c003b2d"],
  ["AAPL", "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"],
  ["MSFT", "0xe93237C50D904957Cf27E7B1133b510C669c2e74"],
  ["SPY", "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C"],
  ["META", "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35"],
  ["GOOGL", "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3"],
] as const;
const ERC20_ABI = ["function balanceOf(address) view returns(uint256)", "function approve(address,uint256) returns(bool)"];
const POOL_KEY = "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const QUOTER_ABI = [`function quoteExactInputSingle(tuple(${POOL_KEY} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)`];

describe("MultiStockSellExecutor (Robinhood Chain fork)", function () {
  it("round-trips all seven supported stock tokens back to USDG", async function () {
    const key = process.env.AGENT_SECRET_1;
    if (!key) throw new Error("AGENT_SECRET_1 is required");
    const buyer = new ethers.Wallet(key, ethers.provider);
    const usdg = new ethers.Contract(USDG, ERC20_ABI, buyer);
    const quoter = new ethers.Contract(QUOTER, QUOTER_ABI, buyer);
    const Buy = await ethers.getContractFactory("MultiStockTradeExecutor", buyer);
    const Sell = await ethers.getContractFactory("MultiStockSellExecutor", buyer);
    const buyExecutor = await Buy.deploy();
    const sellExecutor = await Sell.deploy();
    const amountIn = ethers.parseUnits("0.05", 6);
    await (await usdg.approve(await buyExecutor.getAddress(), amountIn * 7n)).wait();

    for (const [symbol, token] of STOCKS) {
      const usdgFirst = BigInt(USDG) < BigInt(token);
      const keyFor = (input: string, output: string) => ({
        currency0: BigInt(input) < BigInt(output) ? input : output,
        currency1: BigInt(input) < BigInt(output) ? output : input,
        fee: 3000, tickSpacing: 60, hooks: ethers.ZeroAddress,
      });
      const [buyQuote] = await quoter.quoteExactInputSingle.staticCall({ poolKey: keyFor(USDG, token), zeroForOne: usdgFirst, exactAmount: amountIn, hookData: "0x" });
      const stock = new ethers.Contract(token, ERC20_ABI, buyer);
      const beforeStock = await stock.balanceOf(buyer.address);
      await (await buyExecutor.buyStock(token, amountIn, (buyQuote * 99n) / 100n, Math.floor(Date.now() / 1000) + 300)).wait();
      const stockIn = (await stock.balanceOf(buyer.address)) - beforeStock;
      await (await stock.approve(await sellExecutor.getAddress(), stockIn)).wait();
      const [sellQuote] = await quoter.quoteExactInputSingle.staticCall({ poolKey: keyFor(token, USDG), zeroForOne: !usdgFirst, exactAmount: stockIn, hookData: "0x" });
      const beforeUsdg = await usdg.balanceOf(buyer.address);
      const tx = await sellExecutor.sellStock(token, stockIn, (sellQuote * 99n) / 100n, Math.floor(Date.now() / 1000) + 300);
      const receipt = await tx.wait();
      const received = (await usdg.balanceOf(buyer.address)) - beforeUsdg;
      expect(received).to.be.gte((sellQuote * 99n) / 100n);
      await expect(tx).to.emit(sellExecutor, "StockSold").withArgs(buyer.address, symbol, token, stockIn, received);
      expect(receipt!.status).to.equal(1);
    }
  });
});
