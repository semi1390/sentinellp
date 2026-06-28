// ============================================================
// SentinelLP — Chainlink Price Feed
// ============================================================

import { ethers } from "ethers";
import { ETH_RPC_URL, TARGET_NETWORK } from "../config";
import { log } from "../config/logger";

const CHAINLINK_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
];

const PRICE_FEEDS: Record<string, Record<string, string>> = {
  "11155111": {
    "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  },
  "1": {
    "ETH/USD":  "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "USDC/USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "BTC/USD":  "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  },
};

const TOKEN_TO_FEED: Record<string, Record<string, string>> = {
  "11155111": {
    "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": "ETH/USD",
  },
  "1": {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ETH/USD",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC/USD",
  },
};

// Stablecoins — always $1, no oracle needed
const STABLECOINS = new Set([
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", // USDC Sepolia
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC Mainnet
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT Mainnet
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI Mainnet
]);

export class PriceFeed {
  private provider: ethers.JsonRpcProvider;
  private network: string;
  private cache: Map<string, { price: number; timestamp: number }> = new Map();
  private CACHE_TTL_MS = 60_000;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
    this.network = TARGET_NETWORK;
  }

  async getTokenPriceUSD(tokenAddress: string): Promise<number> {
    const normalized = tokenAddress.toLowerCase();

    // Stablecoins are always $1
    if (STABLECOINS.has(normalized)) {
      log.debug(`${tokenAddress} is a stablecoin — price = $1.00`);
      return 1.0;
    }

    // Check cache
    const cached = this.cache.get(normalized);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.price;
    }

    // Find feed
    const feedMap = TOKEN_TO_FEED[this.network] ?? {};
    const feedKey = feedMap[normalized];

    if (!feedKey) {
      log.debug(`No Chainlink feed for token ${tokenAddress} on network ${this.network}`);
      return 0;
    }

    const feedAddress = PRICE_FEEDS[this.network]?.[feedKey];
    if (!feedAddress) {
      log.debug(`No feed address for ${feedKey} on network ${this.network}`);
      return 0;
    }

    try {
      const price = await this.fetchFeedPrice(feedAddress, feedKey);
      this.cache.set(normalized, { price, timestamp: Date.now() });
      return price;
    } catch (err) {
      log.warn(`Failed to fetch ${feedKey} price`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }

  async getEthPriceUSD(): Promise<number> {
    const feedAddress = PRICE_FEEDS[this.network]?.["ETH/USD"];
    if (!feedAddress) return 2500; // fallback
    try {
      return await this.fetchFeedPrice(feedAddress, "ETH/USD");
    } catch {
      return 2500;
    }
  }

  async getPositionValueUSD(
    amount0: string,
    amount1: string,
    token0Address: string,
    token1Address: string,
    token0Decimals: number,
    token1Decimals: number
  ): Promise<number> {
    const [price0, price1] = await Promise.all([
      this.getTokenPriceUSD(token0Address),
      this.getTokenPriceUSD(token1Address),
    ]);

    const value0 = (Number(amount0) / Math.pow(10, token0Decimals)) * price0;
    const value1 = (Number(amount1) / Math.pow(10, token1Decimals)) * price1;

    return value0 + value1;
  }

  private async fetchFeedPrice(feedAddress: string, feedKey: string): Promise<number> {
    const feed = new ethers.Contract(feedAddress, CHAINLINK_ABI, this.provider);

    const [roundData, decimals] = await Promise.all([
      feed.latestRoundData(),
      feed.decimals(),
    ]);

    const price = Number(roundData.answer) / Math.pow(10, Number(decimals));

    log.info(`Chainlink ${feedKey}: $${price.toFixed(2)}`);

    return price;
  }
}

export const priceFeed = new PriceFeed();