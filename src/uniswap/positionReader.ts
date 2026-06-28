// ============================================================
// SentinelLP — Uniswap v3 Position Reader
//
// Reads LP positions from the NonfungiblePositionManager contract.
// This is READ-ONLY. All writes go through KeeperHub.
//
// Key concepts for Uniswap v3 (read this once, you'll be fine):
//   - Every LP position is an NFT with a tokenId
//   - tickLower / tickUpper define the price range
//   - currentTick is the pool's current price as a tick
//   - If currentTick is between tickLower and tickUpper → IN RANGE (earning fees)
//   - If currentTick is outside that range → OUT OF RANGE (earning nothing)
//   - Ticks are logarithmic price steps: tick = log(price) / log(1.0001)
// ============================================================

import { ethers } from "ethers";
import { UniswapV3Position, TokenInfo } from "../types";
import { ETH_RPC_URL, UNISWAP_POSITION_MANAGER, UNISWAP_FACTORY } from "../config";
import { log } from "../config/logger";

// Minimal ABI — only the functions we actually call
const POSITION_MANAGER_ABI = [
  // Get all token IDs owned by an address
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  // Get position details by tokenId
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
];

export class UniswapPositionReader {
  private provider: ethers.JsonRpcProvider;
  private positionManager: ethers.Contract;
  private factory: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
    this.positionManager = new ethers.Contract(
      UNISWAP_POSITION_MANAGER,
      POSITION_MANAGER_ABI,
      this.provider
    );
    this.factory = new ethers.Contract(
      UNISWAP_FACTORY,
      FACTORY_ABI,
      this.provider
    );
  }

  // ---- Public API ----

  /**
   * Fetch all Uniswap v3 LP positions for a wallet address.
   * Returns only positions with liquidity > 0 (ignores closed/empty positions).
   */
  async getPositions(walletAddress: string): Promise<UniswapV3Position[]> {
    log.info("Fetching Uniswap v3 positions", { walletAddress });

    const balance = await this.positionManager.balanceOf(walletAddress);
    const positionCount = Number(balance);

    if (positionCount === 0) {
      log.info("No LP positions found for wallet", { walletAddress });
      return [];
    }

    log.info(`Found ${positionCount} position NFT(s), reading details...`);

    const positions: UniswapV3Position[] = [];

    for (let i = 0; i < positionCount; i++) {
      try {
        const tokenId = await this.positionManager.tokenOfOwnerByIndex(
          walletAddress,
          i
        );
        const position = await this.readPosition(tokenId.toString());

        // Skip positions with no liquidity (closed positions)
        if (BigInt(position.liquidity) === 0n) {
          log.debug(`Position ${tokenId} has zero liquidity, skipping`);
          continue;
        }

        positions.push(position);
      } catch (err) {
        log.error(`Failed to read position at index ${i}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info(`Read ${positions.length} active position(s)`);
    return positions;
  }

  /**
   * Get the current tick for a specific Uniswap v3 pool.
   * The current tick represents the current price of the pool.
   */
  async getCurrentTick(
    token0: string,
    token1: string,
    fee: number
  ): Promise<number> {
    const poolAddress = await this.factory.getPool(token0, token1, fee);

    if (poolAddress === ethers.ZeroAddress) {
      throw new Error(`No pool found for token0=${token0} token1=${token1} fee=${fee}`);
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const slot0 = await pool.slot0();

    return Number(slot0.tick);
  }

  // ---- Private Helpers ----

  private async readPosition(tokenId: string): Promise<UniswapV3Position> {
    const pos = await this.positionManager.positions(tokenId);

    const token0Info = await this.getTokenInfo(pos.token0);
    const token1Info = await this.getTokenInfo(pos.token1);

    // Get current price tick for in-range check
    const currentTick = await this.getCurrentTick(pos.token0, pos.token1, Number(pos.fee));

    log.debug(`Position ${tokenId}`, {
      token0: token0Info.symbol,
      token1: token1Info.symbol,
      fee: `${Number(pos.fee) / 10000}%`,
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      currentTick,
      inRange: currentTick >= Number(pos.tickLower) && currentTick <= Number(pos.tickUpper),
    });

    return {
      tokenId,
      token0: token0Info,
      token1: token1Info,
      fee: Number(pos.fee),
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      liquidity: pos.liquidity.toString(),
      // NOTE: Exact amounts require tick math. These are placeholders.
      // Week 2: replace with full sqrt price calculations.
      amount0: "0",
      amount1: "0",
      feesEarned0: pos.tokensOwed0.toString(),
      feesEarned1: pos.tokensOwed1.toString(),
      // NOTE: USD value requires price oracle integration (Week 2)
      valueUSD: 0,
    };
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([
      token.symbol(),
      token.decimals(),
    ]);

    return {
      address: tokenAddress,
      symbol,
      decimals: Number(decimals),
      // NOTE: Price requires oracle — Chainlink/Coingecko integration in Week 2
      priceUSD: 0,
    };
  }
}
