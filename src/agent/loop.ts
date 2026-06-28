// ============================================================
// SentinelLP — Main Agent Loop
//
// Monitors ALL wallets registered in the SentinelLPOperator contract.
// For each wallet, checks all Uniswap v3 positions and rebalances
// through KeeperHub if needed.
// ============================================================

import cron from "node-cron";
import { UniswapPositionReader } from "../uniswap/positionReader";
import { HealthAssessor } from "./healthAssessor";
import { AgentBrain } from "./brain";
import { KeeperHubClient } from "../keeperhub/client";
import { AuditTrail } from "./auditTrail";
import { operatorReader } from "../contract/operatorReader";
import { WALLET_ADDRESS, POLL_INTERVAL_MINUTES } from "../config";
import { log } from "../config/logger";
import axios from "axios";

const positionReader = new UniswapPositionReader();
const healthAssessor = new HealthAssessor();
const brain = new AgentBrain();
const keeperHub = new KeeperHubClient();
const audit = new AuditTrail();

// ---- Single Poll Cycle ----

async function runCycle(): Promise<void> {
  log.info("═══════════════════════════════════════");
  log.info("SentinelLP — Starting monitoring cycle");
  log.info(`Time: ${new Date().toISOString()}`);
  log.info("═══════════════════════════════════════");

  try {
    // Get all registered users from the contract
    const registeredUsers = await operatorReader.getActiveUsers();

    // Fall back to the hardcoded WALLET_ADDRESS if no users registered yet
    // This lets us keep testing without needing to register first
    const walletsToMonitor = registeredUsers.length > 0
      ? registeredUsers.map((u) => u.address)
      : [WALLET_ADDRESS];

    if (registeredUsers.length === 0) {
      log.info(`No registered users yet — monitoring default wallet: ${WALLET_ADDRESS}`);
    } else {
      log.info(`Monitoring ${walletsToMonitor.length} registered wallet(s)`);
    }

    // Monitor each wallet
    for (const walletAddress of walletsToMonitor) {
      await monitorWallet(walletAddress);
    }

    log.info("Cycle complete ✓");
  } catch (err) {
    log.error("Cycle failed with unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function monitorWallet(walletAddress: string): Promise<void> {
  log.info(`--- Monitoring wallet: ${walletAddress} ---`);

  const positions = await positionReader.getPositions(walletAddress);
  audit.recordScan(walletAddress, positions.length);

  if (positions.length === 0) {
    log.info(`No active LP positions for ${walletAddress}`);
    return;
  }

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

    const decision = await brain.decide(position, health);
    audit.recordDecision(decision);

    log.info(`Decision: ${decision.action} (${decision.confidence} confidence)`, {
      reasoning: decision.reasoning,
    });

    if (decision.action === "REBALANCE") {
      await executeRebalance(position, decision);
      healthAssessor.resetCounter(position.tokenId);
    } else if (decision.action === "COLLECT_FEES") {
      log.info(`Fee collection — coming soon`);
    } else {
      log.info(`No execution needed for ${decision.action}`);
    }
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
    if (axios.isAxiosError(err)) {
      log.error("Failed to submit rebalance to KeeperHub", {
        error: err.message,
        status: err.response?.status,
        details: JSON.stringify(err.response?.data),
        tokenId: position.tokenId,
      });
    } else {
      log.error("Failed to submit rebalance to KeeperHub", {
        error: err instanceof Error ? err.message : String(err),
        tokenId: position.tokenId,
      });
    }
  }
}

// ---- Entry Point ----

async function main(): Promise<void> {
  log.info("🛡️  SentinelLP starting up...");
  log.info(`Polling every ${POLL_INTERVAL_MINUTES} minute(s)`);

  // Show contract stats on startup
  const rebalanceCount = await operatorReader.getRebalanceCount();
  const fee = await operatorReader.getRebalanceFee();
  log.info(`Contract: ${process.env.SENTINEL_OPERATOR_ADDRESS}`);
  log.info(`Total rebalances executed: ${rebalanceCount}`);
  log.info(`Rebalance fee: ${fee} ETH`);

  await runCycle();

  const cronExpression = `*/${POLL_INTERVAL_MINUTES} * * * *`;
  cron.schedule(cronExpression, async () => {
    await runCycle();
  });

  log.info("Agent is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log.error("Fatal startup error", { error: err.message });
  process.exit(1);
});