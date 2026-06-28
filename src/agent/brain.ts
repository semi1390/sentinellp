// ============================================================
// SentinelLP — Agent Brain (Claude-powered)
//
// Takes position health data and produces an AgentDecision.
// Claude reasons about whether to HOLD, REBALANCE, COLLECT, or WAIT.
//
// This is where the "AI" part lives. KeeperHub handles the execution.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { PositionHealth, UniswapV3Position, AgentDecision, AgentAction } from "../types";
import { ANTHROPIC_API_KEY } from "../config";
import { log } from "../config/logger";

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export class AgentBrain {
  /**
   * Given a position and its health assessment, decide what action to take.
   * Uses Claude to reason through the tradeoffs.
   */
  async decide(
    position: UniswapV3Position,
    health: PositionHealth
  ): Promise<AgentDecision> {
    log.info(`Agent reasoning about position ${position.tokenId}`, {
      status: health.status,
      rebalanceWorthIt: health.rebalanceWorthIt,
    });

    // Fast-path: no reasoning needed for simple cases
    if (health.status === "IN_RANGE") {
      return this.quickDecision(position.tokenId, "HOLD", "Position is in range and earning fees. No action needed.", "HIGH");
    }

    if (health.status === "TOO_SMALL") {
      return this.quickDecision(position.tokenId, "HOLD", `Position value is below the $${health.gasCostToRebalanceUSD} minimum threshold. Gas cost would exceed position value.`, "HIGH");
    }

    // For OUT_OF_RANGE, CRITICAL — ask Claude to reason
    return await this.claudeReason(position, health);
  }

  // ---- Private ----

  private async claudeReason(
    position: UniswapV3Position,
    health: PositionHealth
  ): Promise<AgentDecision> {
    const prompt = this.buildPrompt(position, health);

    try {
      const response = await client.messages.create({
       model: "claude-haiku-4-5-20251001",
       max_tokens: 256,
        system: `You are SentinelLP, an autonomous DeFi agent that manages Uniswap v3 liquidity positions.
Your job is to decide what action to take on a position based on its current state.

You must respond with a valid JSON object and nothing else. No markdown, no explanation outside the JSON.

JSON format:
{
  "action": "HOLD" | "REBALANCE" | "COLLECT_FEES" | "WAIT",
  "reasoning": "One to three sentences explaining the decision in plain English.",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "proposedTickLower": <number or null>,
  "proposedTickUpper": <number or null>
}

Rules:
- REBALANCE: Remove liquidity and redeposit at a new centered range. Only if rebalanceWorthIt = true.
- COLLECT_FEES: Only collect uncollected fees, don't move the range. Good if fees are substantial but rebalance cost is too high.
- WAIT: Position is out of range but the economics don't justify acting yet. Check again next poll.
- HOLD: Everything is fine or no action makes economic sense.
- For proposedTickLower/proposedTickUpper: If recommending REBALANCE, suggest a new range centered around currentTick. The fee tier determines tick spacing: 0.05% pool = 10 spacing, 0.3% pool = 60 spacing, 1% pool = 200 spacing. ALWAYS round tickLower DOWN and tickUpper UP to the nearest multiple of the tick spacing. For a 1% pool centered on tick 180109: tickLower = floor(180109/200)*200 = 179800, tickUpper = ceil((180109+887)/200)*200 = 181000. Otherwise null.
- Be economically rational. Never recommend a rebalance that costs more than it saves.`,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "";

      let parsed: {
        action: AgentAction;
        reasoning: string;
        confidence: "HIGH" | "MEDIUM" | "LOW";
        proposedTickLower?: number;
        proposedTickUpper?: number;
      };

    try {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  parsed = JSON.parse(cleaned);
      } catch {
        log.error("Claude returned invalid JSON, defaulting to WAIT", { raw });
        return this.quickDecision(position.tokenId, "WAIT", "Agent reasoning failed (JSON parse error). Will retry next poll.", "LOW");
      }

      log.info(`Agent decided: ${parsed.action}`, {
        tokenId: position.tokenId,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
      });

      return {
        tokenId: position.tokenId,
        action: parsed.action,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
        proposedTickLower: parsed.proposedTickLower,
        proposedTickUpper: parsed.proposedTickUpper,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log.error("Claude API call failed", {
        error: err instanceof Error ? err.message : String(err),
        tokenId: position.tokenId,
      });
      return this.quickDecision(
        position.tokenId,
        "WAIT",
        "Agent reasoning unavailable (API error). Will retry next poll.",
        "LOW"
      );
    }
  }

  private buildPrompt(position: UniswapV3Position, health: PositionHealth): string {
    return `
POSITION STATE:
- Token ID: ${position.tokenId}
- Pool: ${position.token0.symbol} / ${position.token1.symbol} (${position.fee / 10000}% fee tier)
- Position Range: tick ${position.tickLower} to ${position.tickUpper}
- Current Pool Tick: ${health.currentTick}
- Status: ${health.status}
- Consecutive polls out of range: ${health.outOfRangePollCount}
- Estimated position value: $${process.env.FORCE_REBALANCE === "true" ? "1000.00" : position.valueUSD.toFixed(2)}
- Uncollected fees (token0): ${position.feesEarned0}
- Uncollected fees (token1): ${position.feesEarned1}

ECONOMICS:
- Estimated daily fee loss from being out of range: $${process.env.FORCE_REBALANCE === "true" ? "27.40" : health.estimatedDailyFeeLossUSD.toFixed(2)}
- Estimated gas cost to rebalance: $${process.env.FORCE_REBALANCE === "true" ? "15.00" : health.gasCostToRebalanceUSD.toFixed(2)}
- Rebalance worth it economically: ${process.env.FORCE_REBALANCE === "true" ? true : health.rebalanceWorthIt}
Decide what action to take. Respond with valid JSON only.
`.trim();
  }

  private quickDecision(
    tokenId: string,
    action: AgentAction,
    reasoning: string,
    confidence: "HIGH" | "MEDIUM" | "LOW"
  ): AgentDecision {
    return {
      tokenId,
      action,
      reasoning,
      confidence,
      timestamp: new Date().toISOString(),
    };
  }
}
