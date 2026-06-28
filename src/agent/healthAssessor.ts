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


const FORCE_REBALANCE = process.env.FORCE_REBALANCE === "true";

// Track how many consecutive polls each position has been out of range.
// Lives in memory — resets on agent restart. That's fine for now.
const outOfRangeCounts: Map<string, number> = new Map();

export class HealthAssessor {
  /**
   * Assess the health of a single LP position.
   * Returns a PositionHealth object with status and action signals.
   */
  assess(position: UniswapV3Position, currentTick: number): PositionHealth {
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
    const gasCostUSD = this.estimateGasCostUSD();
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
   * Placeholder gas estimate.
   * Week 2: Replace with KeeperHub's real gas estimation API.
   *
   * A rebalance is 3 transactions:
   *   1. decreaseLiquidity (remove from current range)
   *   2. collect (collect tokens + fees)
   *   3. mint (deposit at new range)
   * Estimate ~$15 total at moderate gas prices.
   */
  private estimateGasCostUSD(): number {
    // TODO: Call KeeperHub gas estimation endpoint
    // return await keeperHub.estimateGas(workflow)
    return 15;
  }

  /**
   * Rough estimate of daily fee income being missed.
   * When out of range, fee earnings = 0. We estimate what the position
   * *would* earn based on its share of pool liquidity and typical volume.
   *
   * Week 2: Replace with real fee APR from subgraph or Uniswap API.
   */
  private estimateDailyFeeLoss(position: UniswapV3Position): number {
    if (position.valueUSD === 0) return 0;
    // Assume 20% APR as placeholder (typical for active pools)
    // Daily fee = value * APR / 365
    // TODO: Fetch real APR from Uniswap subgraph
    const assumedAPR = 0.20;
    return (position.valueUSD * assumedAPR) / 365;
  }
}
