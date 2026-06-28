// ============================================================
// SentinelLP — Core Types
// Single source of truth for all data shapes in the project
// ============================================================

// --- Uniswap v3 Position ---

export interface UniswapV3Position {
  tokenId: string;           // NFT token ID representing the position
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;               // Fee tier: 500, 3000, or 10000 (0.05%, 0.3%, 1%)
  tickLower: number;         // Lower bound of the price range
  tickUpper: number;         // Upper bound of the price range
  liquidity: string;         // Current liquidity (bigint as string)
  amount0: string;           // Amount of token0 in position
  amount1: string;           // Amount of token1 in position
  feesEarned0: string;       // Uncollected fees in token0
  feesEarned1: string;       // Uncollected fees in token1
  valueUSD: number;          // Estimated total position value in USD
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  priceUSD: number;
}

// --- Position Health ---

export type PositionStatus =
  | "IN_RANGE"        // Currently earning fees — all good
  | "OUT_OF_RANGE"    // Price moved outside the range — earning nothing
  | "CRITICAL"        // Out of range AND gas-adjusted rebalance is worth it
  | "TOO_SMALL";      // Position value below MIN_POSITION_VALUE_USD threshold

export interface PositionHealth {
  tokenId: string;
  status: PositionStatus;
  currentTick: number;           // The pool's current price tick
  tickLower: number;
  tickUpper: number;
  outOfRangePollCount: number;   // How many consecutive polls it's been out of range
  estimatedDailyFeeLossUSD: number; // Fees being missed per day by being out of range
  gasCostToRebalanceUSD: number; // Estimated cost to execute the rebalance
  rebalanceWorthIt: boolean;     // feeLoss > gasCost check
}

// --- Agent Decision ---

export type AgentAction =
  | "HOLD"            // Position is fine, do nothing
  | "REBALANCE"       // Remove + redeposit at new range
  | "COLLECT_FEES"    // Just collect fees, don't move range
  | "CLOSE"           // Close position entirely (e.g. value too low, gas not worth it)
  | "WAIT";           // Out of range but gas cost outweighs benefit — check again next poll

export interface AgentDecision {
  tokenId: string;
  action: AgentAction;
  reasoning: string;             // Claude's natural language explanation
  confidence: "HIGH" | "MEDIUM" | "LOW";
  proposedTickLower?: number;    // For REBALANCE: new range
  proposedTickUpper?: number;    // For REBALANCE: new range
  timestamp: string;             // ISO 8601
}

// --- KeeperHub Execution ---

export type ExecutionStatus =
  | "PENDING"
  | "SIMULATED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "RETRYING";

export interface KeeperHubJob {
  jobId: string;               // KeeperHub-assigned job ID
  tokenId: string;             // Which LP position this job is for
  action: AgentAction;
  status: ExecutionStatus;
  txHash?: string;             // Populated after submission
  gasUsed?: string;
  gasCostEth?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  auditTrailUrl?: string;      // KeeperHub audit trail link — key for hackathon demo
}

export interface KeeperHubWorkflowStep {
  name: string;
  contract: string;            // Contract address to call
  method: string;              // ABI method name
  params: Record<string, unknown>;
  value?: string;              // ETH value to send (if any)
}

export interface KeeperHubWorkflow {
  workflowId: string;
  steps: KeeperHubWorkflowStep[];
  gasLimit?: string;
  priorityFee?: string;
  usePrivateRouting: boolean;  // MEV protection — always true for LP ops
}

// --- Audit Trail (local + KeeperHub) ---

export interface AuditEntry {
  id: string;
  tokenId: string;
  timestamp: string;
  event:
    | "POSITION_SCANNED"
    | "HEALTH_ASSESSED"
    | "AGENT_DECIDED"
    | "EXECUTION_SUBMITTED"
    | "EXECUTION_CONFIRMED"
    | "EXECUTION_FAILED";
  data: Record<string, unknown>;
  keeperHubJobId?: string;
  txHash?: string;
}

// --- Config ---

export interface SentinelConfig {
  walletAddress: string;
  pollIntervalMinutes: number;
  outOfRangeThresholdPolls: number;
  minPositionValueUSD: number;
  rpcUrl: string;
}
