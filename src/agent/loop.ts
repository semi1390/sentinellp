// ============================================================
// SentinelLP — Main Agent Loop
//
// This is the top-level orchestrator. It:
//   1. Fetches all LP positions for the wallet
//   2. Assesses health of each position
//   3. Asks Claude to decide what action to take
//   4. Submits execution to KeeperHub if action is needed
//   5. Waits for confirmation and records audit trail
//   6. Sleeps until next poll
//
// Run with: npm run agent
// ============================================================

import cron from "node-cron";
import { UniswapPositionReader } from "../uniswap/positionReader";
import { HealthAssessor } from "./healthAssessor";
import { AgentBrain } from "./brain";
import { KeeperHubClient } from "../keeperhub/client";
import { AuditTrail } from "./auditTrail";
import { WALLET_ADDRESS, POLL_INTERVAL_MINUTES } from "../config";
import { log } from "../config/logger";

const positionReader = new UniswapPositionReader();
const healthAssessor = new HealthAssessor();
const brain = new AgentBrain();
const keeperHub = new KeeperHubClient();
const audit = new AuditTrail();

// ---- Single Poll Cycle ----

async function runCycle(): Promise<void> {
  log.info("═══════════════════════════════════════");
  log.info("SentinelLP — Starting monitoring cycle");
  log.info(`Wallet: ${WALLET_ADDRESS}`);
  log.info(`Time: ${new Date().toISOString()}`);
  log.info("═══════════════════════════════════════");

  try {
    // Step 1: Fetch all LP positions
    const positions = await positionReader.getPositions(WALLET_ADDRESS);

    audit.recordScan(WALLET_ADDRESS, positions.length);

    if (positions.length === 0) {
      log.info("No active LP positions to monitor. Sleeping until next poll.");
      return;
    }

    // Step 2: Assess health of each position
    for (const position of positions) {
      log.info(`─── Checking position ${position.tokenId} (${position.token0.symbol}/${position.token1.symbol}) ───`);

      const currentTick = await positionReader.getCurrentTick(
        position.token0.address,
        position.token1.address,
        position.fee
      );

      const health = await healthAssessor.assess(position, currentTick);
      audit.recordHealthAssessment(health);

      log.info(`Status: ${health.status}`, {
        tokenId: position.tokenId,
        currentTick,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
      });

      // Step 3: Agent decides what to do
      const decision = await brain.decide(position, health);
      audit.recordDecision(decision);

      log.info(`Decision: ${decision.action} (${decision.confidence} confidence)`, {
        reasoning: decision.reasoning,
      });

      // Step 4: Execute via KeeperHub if action is needed
      if (decision.action === "REBALANCE") {
        await executeRebalance(position, decision);
        healthAssessor.resetCounter(position.tokenId);
      } else if (decision.action === "COLLECT_FEES") {
        // TODO: Implement fee collection workflow in Week 2
        log.info(`Fee collection not yet implemented — will add in Week 2`);
      } else {
        log.info(`No execution needed for ${decision.action}`);
      }
    }

    log.info("Cycle complete ✓");
  } catch (err) {
    log.error("Cycle failed with unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Don't rethrow — let the agent keep running on next poll
  }
}

async function executeRebalance(
  position: Parameters<typeof keeperHub.submitRebalance>[0],
  decision: Parameters<typeof keeperHub.submitRebalance>[1]
): Promise<void> {
  log.info(`Submitting rebalance to KeeperHub for position ${position.tokenId}`);

  try {
    const job = await keeperHub.submitRebalance(position, decision);
    audit.recordExecutionSubmitted(job);

    log.info(`KeeperHub job submitted`, {
      jobId: job.jobId,
      auditTrailUrl: job.auditTrailUrl,
    });

    // Wait for the 3-step workflow to complete
    const completedJob = await keeperHub.waitForCompletion(job.jobId);

    if (completedJob.status === "CONFIRMED") {
      audit.recordExecutionConfirmed(completedJob);
      log.info(`Rebalance complete ✅`, {
        txHash: completedJob.txHash,
        gasUsed: completedJob.gasUsed,
      });
    } else {
      audit.recordExecutionFailed(completedJob);
      log.error(`Rebalance failed ❌`, {
        error: completedJob.errorMessage,
        jobId: completedJob.jobId,
      });
    }
  } catch (err) {
    log.error("Failed to submit rebalance to KeeperHub", {
      error: err instanceof Error ? err.message : String(err),
      tokenId: position.tokenId,
    });
  }
}

// ---- Entry Point ----

async function main(): Promise<void> {
  log.info("🛡️  SentinelLP starting up...");
  log.info(`Polling every ${POLL_INTERVAL_MINUTES} minute(s)`);
  log.info(`Monitoring wallet: ${WALLET_ADDRESS}`);

  // Run immediately on startup
  await runCycle();

  // Then run on schedule
  const cronExpression = `*/${POLL_INTERVAL_MINUTES} * * * *`;
  log.info(`Scheduling cron: ${cronExpression}`);

  cron.schedule(cronExpression, async () => {
    await runCycle();
  });

  log.info("Agent is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log.error("Fatal startup error", { error: err.message });
  process.exit(1);
});