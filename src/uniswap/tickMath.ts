// ============================================================
// SentinelLP — Uniswap V3 Tick Math
//
// Calculates real token amounts held by a position based on
// liquidity, tick range, and current pool price.
//
// Reference: Uniswap V3 whitepaper, LiquidityAmounts.sol
// ============================================================

/**
 * Convert a tick to its sqrt price (Q64.96 fixed point format).
 * sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
 */
function tickToSqrtPriceX96(tick: number): bigint {
  const price = Math.pow(1.0001, tick);
  const sqrtPrice = Math.sqrt(price);
  // Convert to Q64.96 fixed point
  return BigInt(Math.floor(sqrtPrice * Math.pow(2, 96)));
}

/**
 * Calculate the actual token0 and token1 amounts held by a
 * Uniswap v3 position given its liquidity and tick range,
 * relative to the pool's current price.
 *
 * Three cases:
 *   1. Current price below range  → all liquidity is in token0
 *   2. Current price above range  → all liquidity is in token1
 *   3. Current price within range → liquidity split between both
 */
export function getPositionAmounts(
  liquidity: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): { amount0: bigint; amount1: bigint } {
  if (liquidity === 0n) {
    return { amount0: 0n, amount1: 0n };
  }

  const sqrtPriceCurrent = tickToSqrtPriceX96(currentTick);
  const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
  const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);

  const Q96 = BigInt(2) ** BigInt(96);

  let amount0 = 0n;
  let amount1 = 0n;

  if (currentTick < tickLower) {
    // Price below range — all liquidity is token0
    amount0 = getAmount0Delta(sqrtPriceLower, sqrtPriceUpper, liquidity);
  } else if (currentTick < tickUpper) {
    // Price within range — split between token0 and token1
    amount0 = getAmount0Delta(sqrtPriceCurrent, sqrtPriceUpper, liquidity);
    amount1 = getAmount1Delta(sqrtPriceLower, sqrtPriceCurrent, liquidity);
  } else {
    // Price above range — all liquidity is token1
    amount1 = getAmount1Delta(sqrtPriceLower, sqrtPriceUpper, liquidity);
  }

  return { amount0, amount1 };
}

function getAmount0Delta(sqrtPriceA: bigint, sqrtPriceB: bigint, liquidity: bigint): bigint {
  if (sqrtPriceA > sqrtPriceB) [sqrtPriceA, sqrtPriceB] = [sqrtPriceB, sqrtPriceA];
  const Q96 = BigInt(2) ** BigInt(96);
  if (sqrtPriceA === 0n) return 0n;
  const numerator = liquidity * Q96 * (sqrtPriceB - sqrtPriceA);
  const denominator = sqrtPriceB * sqrtPriceA;
  return numerator / denominator;
}

function getAmount1Delta(sqrtPriceA: bigint, sqrtPriceB: bigint, liquidity: bigint): bigint {
  if (sqrtPriceA > sqrtPriceB) [sqrtPriceA, sqrtPriceB] = [sqrtPriceB, sqrtPriceA];
  const Q96 = BigInt(2) ** BigInt(96);
  return (liquidity * (sqrtPriceB - sqrtPriceA)) / Q96;
}