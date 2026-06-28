// ============================================================
// SentinelLP — KeeperHub Client
// ============================================================

import axios, { AxiosInstance } from "axios";
import { ethers } from "ethers";
import { AgentDecision, UniswapV3Position, KeeperHubJob } from "../types";
import { KEEPERHUB_API_KEY, TARGET_NETWORK, WALLET_ADDRESS } from "../config";
import { log } from "../config/logger";

const BASE_URL = "https://app.keeperhub.com/api";

const UNISWAP_POSITION_MANAGER_SEPOLIA = "0x1238536071e1c677a632429e3655c799b22cda52";
const UNISWAP_POSITION_MANAGER_MAINNET = "0xc36442b4a4522e871399cd717abdd847ab11fe88";

const POSITION_MANAGER_ABI = JSON.stringify([{"inputs":[{"internalType":"address","name":"_factory","type":"address"},{"internalType":"address","name":"_WETH9","type":"address"},{"internalType":"address","name":"_tokenDescriptor_","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"components":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint128","name":"amount0Max","type":"uint128"},{"internalType":"uint128","name":"amount1Max","type":"uint128"}],"internalType":"struct INonfungiblePositionManager.CollectParams","name":"params","type":"tuple"}],"name":"collect","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"payable","type":"function"},{"inputs":[{"components":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"amount0Min","type":"uint256"},{"internalType":"uint256","name":"amount1Min","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"internalType":"struct INonfungiblePositionManager.DecreaseLiquidityParams","name":"params","type":"tuple"}],"name":"decreaseLiquidity","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"payable","type":"function"},{"inputs":[{"components":[{"internalType":"address","name":"token0","type":"address"},{"internalType":"address","name":"token1","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint256","name":"amount0Desired","type":"uint256"},{"internalType":"uint256","name":"amount1Desired","type":"uint256"},{"internalType":"uint256","name":"amount0Min","type":"uint256"},{"internalType":"uint256","name":"amount1Min","type":"uint256"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"internalType":"struct INonfungiblePositionManager.MintParams","name":"params","type":"tuple"}],"name":"mint","outputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"payable","type":"function"}]);

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

export class KeeperHubClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
  }

  async submitRebalance(
    position: UniswapV3Position,
    decision: AgentDecision,
    network: string = TARGET_NETWORK
  ): Promise<KeeperHubJob> {
    log.info(`Creating rebalance workflow in KeeperHub`, {
      tokenId: position.tokenId,
      proposedTickLower: decision.proposedTickLower,
      proposedTickUpper: decision.proposedTickUpper,
      network,
    });

    const workflowId = await this.createRebalanceWorkflow(position, decision, network);
    log.info(`Workflow created: ${workflowId}`);

    const executionId = await this.executeWorkflow(workflowId);
    log.info(`Execution started: ${executionId}`);

    return {
      jobId: executionId,
      tokenId: position.tokenId,
      action: decision.action,
      status: "PENDING",
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      auditTrailUrl: `https://app.keeperhub.com/workflows/${workflowId}/executions/${executionId}`,
    };
  }

  async waitForCompletion(executionId: string, timeoutMs = 300_000): Promise<KeeperHubJob> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getExecutionStatus(executionId);
      log.debug(`Execution ${executionId}: ${status.status}`);

      if (status.status === "success") {
        const execLogs = await this.getExecutionLogs(executionId);
        const txHash = this.extractTxHash(execLogs);
        log.info(`✅ Rebalance confirmed onchain`, { txHash });
        return {
          jobId: executionId,
          tokenId: "",
          action: "REBALANCE",
          status: "CONFIRMED",
          txHash,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          auditTrailUrl: `https://app.keeperhub.com/workflows/executions/${executionId}`,
        };
      }

      if (status.status === "error" || status.status === "cancelled") {
        log.error(`❌ Execution ${executionId} failed: ${status.status}`);
        return {
          jobId: executionId,
          tokenId: "",
          action: "REBALANCE",
          status: "FAILED",
          errorMessage: status.status,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      await this.sleep(5_000);
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs / 1000}s`);
  }

  async getExecutionStatus(executionId: string): Promise<{
    status: "pending" | "running" | "success" | "error" | "cancelled";
    progress?: { percentage: number; completedSteps: number; totalSteps: number };
  }> {
    const res = await this.http.get(`/workflows/executions/${executionId}/status`);
    return res.data;
  }

  async getExecutionLogs(executionId: string): Promise<Array<{
    nodeId: string;
    nodeName: string;
    status: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration: number;
  }>> {
    const res = await this.http.get(`/workflows/executions/${executionId}/logs`);
    return res.data.data ?? [];
  }

  async listExecutions(workflowId: string): Promise<Array<{
    id: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>> {
    const res = await this.http.get(`/workflows/${workflowId}/executions`);
    return res.data.data ?? [];
  }

  private async createRebalanceWorkflow(
    position: UniswapV3Position,
    decision: AgentDecision,
    network: string
  ): Promise<string> {
    const tokenId = position.tokenId;
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const positionManager = network === "1"
      ? UNISWAP_POSITION_MANAGER_MAINNET
      : UNISWAP_POSITION_MANAGER_SEPOLIA;

    // Read actual wallet token balances for mint
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const token0Contract = new ethers.Contract(position.token0.address, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(position.token1.address, ERC20_ABI, provider);
    const amount0Balance = (await token0Contract.balanceOf(WALLET_ADDRESS)).toString();
    const amount1Balance = (await token1Contract.balanceOf(WALLET_ADDRESS)).toString();

    log.info(`Wallet token balances for mint`, {
      token0: position.token0.symbol,
      amount0: amount0Balance,
      token1: position.token1.symbol,
      amount1: amount1Balance,
    });

   // Snap ticks to fee tier tick spacing
const tickSpacing = position.fee === 500 ? 10 : position.fee === 3000 ? 60 : 200;
const snapDown = (tick: number) => Math.floor(tick / tickSpacing) * tickSpacing;
const snapUp = (tick: number) => Math.ceil(tick / tickSpacing) * tickSpacing;
const tickLower = snapDown(decision.proposedTickLower ?? 0);
const tickUpper = snapUp(decision.proposedTickUpper ?? 0);

const name = `SentinelLP Rebalance — Position #${tokenId} — ${new Date().toISOString()}`;
    const description = `Agent decision: ${decision.reasoning}`;

    const nodes = [
      {
        id: "trigger-1",
        type: "trigger",
        data: {
          label: "Agent Trigger",
          type: "trigger",
          config: { triggerType: "Manual" },
          status: "idle",
          description: "",
        },
      },
      {
        id: "step-decrease",
        type: "action",
        data: {
          label: "Remove Liquidity",
          type: "action",
          config: {
            actionType: "web3/write-contract",
            network,
            contractAddress: positionManager,
            abi: POSITION_MANAGER_ABI,
            abiFunction: "decreaseLiquidity",
            functionArgs: JSON.stringify([{
              tokenId,
              liquidity: position.liquidity,
              amount0Min: "0",
              amount1Min: "0",
              deadline: String(deadline),
            }]),
            usePrivateMempool: false,
          },
          status: "idle",
          description: "",
        },
      },
      {
        id: "step-collect",
        type: "action",
        data: {
          label: "Collect Tokens & Fees",
          type: "action",
          config: {
            actionType: "web3/write-contract",
            network,
            contractAddress: positionManager,
            abi: POSITION_MANAGER_ABI,
            abiFunction: "collect",
            functionArgs: JSON.stringify([{
              tokenId,
              recipient: WALLET_ADDRESS,
              amount0Max: "340282366920938463463374607431768211455",
              amount1Max: "340282366920938463463374607431768211455",
            }]),
            usePrivateMempool: false,
          },
          status: "idle",
          description: "",
        },
      },
{
  id: "step-approve0",
  type: "action",
  data: {
    label: "Approve Token0 (USDC)",
    type: "action",
    config: {
      actionType: "web3/approve-token",
      network,
      tokenConfig: position.token0.address,
      spenderAddress: positionManager,
      amount: amount0Balance,
    },
    status: "idle",
    description: "",
  },
},
{
  id: "step-approve1",
  type: "action",
  data: {
    label: "Approve Token1 (WETH)",
    type: "action",
    config: {
      actionType: "web3/approve-token",
      network,
      tokenConfig: position.token1.address,
      spenderAddress: positionManager,
      amount: amount1Balance,
    },
    status: "idle",
    description: "",
  },
},
      {
        id: "step-mint",
        type: "action",
        data: {
          label: "Open New Position",
          type: "action",
          config: {
            actionType: "web3/write-contract",
            network,
            contractAddress: positionManager,
            abi: POSITION_MANAGER_ABI,
            abiFunction: "mint",
            functionArgs: JSON.stringify([{
              token0: position.token0.address,
              token1: position.token1.address,
              fee: String(position.fee),
            tickLower: String(tickLower),
tickUpper: String(tickUpper),
              amount0Desired: amount0Balance,
              amount1Desired: amount1Balance,
              amount0Min: "0",
              amount1Min: "0",
              recipient: WALLET_ADDRESS,
              deadline: String(deadline),
            }]),
            usePrivateMempool: false,
          },
          status: "idle",
          description: "",
        },
      },
    ];

    const edges = [
      { id: "e1", source: "trigger-1", target: "step-decrease" },
      { id: "e2", source: "step-decrease", target: "step-collect" },
     { id: "e3", source: "step-collect", target: "step-approve0" },
{ id: "e4", source: "step-approve0", target: "step-approve1" },
{ id: "e5", source: "step-approve1", target: "step-mint" },
    ];

    const createRes = await this.http.post("/workflows/create", {
      name,
      description,
      nodes,
      edges,
    });

    const workflowId = createRes.data.id;
    log.info(`Workflow created: ${workflowId}`);
    return workflowId;
  }

  private async executeWorkflow(workflowId: string): Promise<string> {
    const res = await this.http.post(`/workflow/${workflowId}/execute`, {});
    return res.data.executionId ?? res.data.id;
  }

  private extractTxHash(
    logs: Array<{ output: Record<string, unknown> }>
  ): string | undefined {
    for (const entry of logs) {
      if (entry.output?.transactionHash) return entry.output.transactionHash as string;
      if (entry.output?.transactionLink) {
        const link = entry.output.transactionLink as string;
        const match = link.match(/0x[a-fA-F0-9]{64}/);
        if (match) return match[0];
      }
    }
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}