// ============================================================
// SentinelLP — Local Audit Trail
//
// Every decision the agent makes and every execution it triggers
// is recorded here. This is SEPARATE from KeeperHub's own audit
// trail (which covers the execution side).
//
// Together they give you the full picture:
//   Local audit: WHY the agent decided to act
//   KeeperHub audit: HOW the execution was carried out
//
// The audit trail is also your hackathon demo evidence.
// ============================================================

import fs from "fs";
import path from "path";
import { AuditEntry, AgentDecision, PositionHealth, KeeperHubJob } from "../types";
import { log } from "../config/logger";

const AUDIT_FILE = path.join("logs", "audit.jsonl");

export class AuditTrail {
  constructor() {
    // Ensure log directory exists
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  recordScan(tokenId: string, positionCount: number): void {
    this.write({
      id: this.id(),
      tokenId,
      timestamp: new Date().toISOString(),
      event: "POSITION_SCANNED",
      data: { positionCount },
    });
  }

  recordHealthAssessment(health: PositionHealth): void {
    this.write({
      id: this.id(),
      tokenId: health.tokenId,
      timestamp: new Date().toISOString(),
      event: "HEALTH_ASSESSED",
      data: {
        status: health.status,
        currentTick: health.currentTick,
        tickLower: health.tickLower,
        tickUpper: health.tickUpper,
        outOfRangePollCount: health.outOfRangePollCount,
        rebalanceWorthIt: health.rebalanceWorthIt,
        estimatedDailyFeeLossUSD: health.estimatedDailyFeeLossUSD,
        gasCostToRebalanceUSD: health.gasCostToRebalanceUSD,
      },
    });
  }

  recordDecision(decision: AgentDecision): void {
    this.write({
      id: this.id(),
      tokenId: decision.tokenId,
      timestamp: decision.timestamp,
      event: "AGENT_DECIDED",
      data: {
        action: decision.action,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        proposedTickLower: decision.proposedTickLower,
        proposedTickUpper: decision.proposedTickUpper,
      },
    });
  }

  recordExecutionSubmitted(job: KeeperHubJob): void {
    this.write({
      id: this.id(),
      tokenId: job.tokenId,
      timestamp: job.createdAt,
      event: "EXECUTION_SUBMITTED",
      keeperHubJobId: job.jobId,
      data: {
        action: job.action,
        auditTrailUrl: job.auditTrailUrl,
      },
    });
  }

  recordExecutionConfirmed(job: KeeperHubJob): void {
    this.write({
      id: this.id(),
      tokenId: job.tokenId,
      timestamp: job.updatedAt,
      event: "EXECUTION_CONFIRMED",
      keeperHubJobId: job.jobId,
      txHash: job.txHash,
      data: {
        gasUsed: job.gasUsed,
        gasCostEth: job.gasCostEth,
        retryCount: job.retryCount,
        auditTrailUrl: job.auditTrailUrl,
      },
    });
    log.info(`🔗 KeeperHub audit trail: ${job.auditTrailUrl}`);
    log.info(`🔗 Etherscan: https://etherscan.io/tx/${job.txHash}`);
  }

  recordExecutionFailed(job: KeeperHubJob): void {
    this.write({
      id: this.id(),
      tokenId: job.tokenId,
      timestamp: job.updatedAt,
      event: "EXECUTION_FAILED",
      keeperHubJobId: job.jobId,
      data: {
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        auditTrailUrl: job.auditTrailUrl,
      },
    });
  }

  /**
   * Read the full audit trail. Useful for the frontend dashboard (Week 2).
   */
  readAll(): AuditEntry[] {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, "utf-8").trim().split("\n");
    return lines
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AuditEntry => entry !== null);
  }

  // ---- Private ----

  private write(entry: AuditEntry): void {
    try {
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      log.error("Failed to write to audit trail", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private id(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
}
