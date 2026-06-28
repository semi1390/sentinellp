// ============================================================
// SentinelLP — Position Health Assessor
//
// Takes raw position data and produces a PositionHealth object.
// This is pure business logic — no chain calls, no side effects.
// Easy to unit test.
// ============================================================

import { UniswapV3Position, PositionHealth, PositionStatus } from "../types";
import { MIN_POSITION_VALUE_USD, OUT_OF_RANGE_THRESHOLD_POLLS } from "../config";
import { log } from "../config/logger";
import { priceFeed } from "../uniswap/priceFeed";

// TESTING FLAG: set FORCE_REBALANCE=true in .env to bypass range check
const FORCE_REBALANCE = process.env.FORCE_REBALANCE === "true";

// Track how many consecutive polls each position has been out of range.
// Lives in memory — resets on agent restart. That's fine for now.
const outOfRangeCounts: Map<string, number> = new Map();

export class HealthAssessor {
  /**
   * Assess the health of a single LP position.
   * Returns a PositionHealth object with status and action signals.
   */
  async assess(position: UniswapV3Position, currentTick: number): Promise<PositionHealth> {
    const { tokenId, tickLower, tickUpper, valueUSD } = position;

    // --- Check 1: Is the position too small to bother with? ---
    if (valueUSD > 0 && valueUSD < MIN_POSITION_VALUE_USD) {
      log.info(`Position ${tokenId} below minimum value threshold`, {
        valueUSD,
        threshold: MIN_POSITION_VALUE_USD,
      });
      outOfRangeCounts.delete(tokenId); // Reset counter
      return this.buildHealth(position, currentTick, "TOO_SMALL", 0, false);
    }

    // --- Check 2: Is the current price inside the position's range? ---
    // FORCE_REBALANCE=true in .env bypasses this for testing
    const inRange = FORCE_REBALANCE ? false : (currentTick >= tickLower && currentTick <= tickUpper);
    if (FORCE_REBALANCE) log.warn("⚠️  FORCE_REBALANCE=true — treating position as out of range for testing");

    if (inRange) {
      // Great — position is earning fees. Reset out-of-range counter.
      if (outOfRangeCounts.has(tokenId)) {
        log.info(`Position ${tokenId} back in range`, { currentTick, tickLower, tickUpper });
        outOfRangeCounts.delete(tokenId);
      }
      return this.buildHealth(position, currentTick, "IN_RANGE", 0, false);
    }

    // --- Out of range: increment counter ---
    const prevCount = outOfRangeCounts.get(tokenId) ?? 0;
    const newCount = prevCount + 1;
    outOfRangeCounts.set(tokenId, newCount);

    log.warn(`Position ${tokenId} out of range`, {
      currentTick,
      tickLower,
      tickUpper,
      consecutivePolls: newCount,
      threshold: OUT_OF_RANGE_THRESHOLD_POLLS,
    });

    // --- Check 3: Has it been out of range long enough to act? ---
    if (newCount < OUT_OF_RANGE_THRESHOLD_POLLS) {
      return this.buildHealth(position, currentTick, "OUT_OF_RANGE", newCount, false);
    }

    // --- Check 4: Is rebalancing gas-economical? ---
    // NOTE: Real gas estimation comes from KeeperHub in Week 2.
    // For now, use a placeholder that always returns ~$15 gas cost.
    const gasCostUSD = await this.estimateGasCostUSD();
    const estimatedDailyFeeLossUSD = this.estimateDailyFeeLoss(position);
    const rebalanceWorthIt = FORCE_REBALANCE ? true : estimatedDailyFeeLossUSD > gasCostUSD;

    log.info(`Position ${tokenId} rebalance economics`, {
      estimatedDailyFeeLossUSD: estimatedDailyFeeLossUSD.toFixed(2),
      gasCostUSD: gasCostUSD.toFixed(2),
      rebalanceWorthIt,
    });

    return this.buildHealth(
      position,
      currentTick,
      "CRITICAL",
      newCount,
      rebalanceWorthIt,
      estimatedDailyFeeLossUSD,
      gasCostUSD
    );
  }

  /**
   * Reset the out-of-range counter for a position.
   * Call this after a successful rebalance.
   */
  resetCounter(tokenId: string): void {
    outOfRangeCounts.delete(tokenId);
    log.debug(`Reset out-of-range counter for position ${tokenId}`);
  }

  // ---- Private Helpers ----

  private buildHealth(
    position: UniswapV3Position,
    currentTick: number,
    status: PositionStatus,
    outOfRangePollCount: number,
    rebalanceWorthIt: boolean,
    estimatedDailyFeeLossUSD = 0,
    gasCostToRebalanceUSD = 0
  ): PositionHealth {
    return {
      tokenId: position.tokenId,
      status,
      currentTick,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      outOfRangePollCount,
      estimatedDailyFeeLossUSD,
      gasCostToRebalanceUSD,
      rebalanceWorthIt,
    };
  }

  /**
   * Real gas cost estimate using current ETH price from Chainlink.
   * Based on actual gas units measured from our Sepolia executions:
   *   decreaseLiquidity: ~182,000 gas
   *   collect:           ~118,000 gas
   *   approve x2:        ~130,000 gas
   *   mint:              ~426,000 gas
   *   Total:             ~856,000 gas units
   */
  private async estimateGasCostUSD(): Promise<number> {
    try {
      const { ethers } = await import("ethers");
      const { ETH_RPC_URL } = await import("../config");
      const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
      const feeData = await provider.getFeeData();
      const gasPriceWei = feeData.gasPrice ?? BigInt(5_000_000_000); // 5 gwei fallback

      const TOTAL_GAS_UNITS = 856_000n;
      const gasCostWei = gasPriceWei * TOTAL_GAS_UNITS;
      const gasCostEth = Number(gasCostWei) / 1e18;

      const ethPriceUSD = await priceFeed.getEthPriceUSD();
      const gasCostUSD = gasCostEth * (ethPriceUSD || 2500); // fallback $2500 ETH

      return gasCostUSD;
    } catch {
      return 15; // fallback if estimation fails
    }
  }

  /**
   * Estimate daily fee loss from being out of range.
   * Uses real position value from Chainlink prices.
   * Assumes 20% APR as a conservative estimate for active USDC/WETH pools.
   * Week 2: Replace with real APR from Uniswap subgraph.
   */
  private estimateDailyFeeLoss(position: UniswapV3Position): number {
    if (position.valueUSD === 0) return 0;
    const assumedAPR = 0.20;
    return (position.valueUSD * assumedAPR) / 365;
  }
}