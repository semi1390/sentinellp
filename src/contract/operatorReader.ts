// ============================================================
// SentinelLP — Operator Contract Reader
//
// Reads registered users from the SentinelLPOperator contract.
// The agent monitors ALL registered wallets, not just one.
// ============================================================

import { ethers } from "ethers";
import { ETH_RPC_URL, SENTINEL_OPERATOR_ADDRESS } from "../config";
import { log } from "../config/logger";

const OPERATOR_ABI = [
  "function getRegisteredUsers() view returns (address[])",
  "function getUserDeposit(address user) view returns (uint256)",
  "function isUserApproved(address user) view returns (bool)",
  "function registered(address) view returns (bool)",
  "function rebalanceFee() view returns (uint256)",
  "function getRebalanceCount() view returns (uint256)",
];

export interface RegisteredUser {
  address: string;
  deposit: string;       // ETH deposit in wei
  depositETH: string;    // human readable
  isApproved: boolean;   // has approved the operator
  isActive: boolean;     // registered + approved + has deposit
}

export class OperatorReader {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
    this.contract = new ethers.Contract(
      SENTINEL_OPERATOR_ADDRESS,
      OPERATOR_ABI,
      this.provider
    );
  }

  /**
   * Get all registered users and their status.
   * Returns only ACTIVE users (registered + approved + has deposit).
   */
  async getActiveUsers(): Promise<RegisteredUser[]> {
    try {
      const addresses: string[] = await this.contract.getRegisteredUsers();

      if (addresses.length === 0) {
        log.info("No registered users in SentinelLP contract");
        return [];
      }

      log.info(`Found ${addresses.length} registered user(s) in contract`);

      const users: RegisteredUser[] = await Promise.all(
        addresses.map(async (address) => {
          const [deposit, isApproved] = await Promise.all([
            this.contract.getUserDeposit(address),
            this.contract.isUserApproved(address),
          ]);

          const depositETH = ethers.formatEther(deposit);
          const isActive = isApproved && BigInt(deposit) > 0n;

          return {
            address,
            deposit: deposit.toString(),
            depositETH,
            isApproved,
            isActive,
          };
        })
      );

      const activeUsers = users.filter((u) => u.isActive);

      log.info(`Active users: ${activeUsers.length}/${addresses.length}`, {
        users: activeUsers.map((u) => ({
          address: u.address,
          depositETH: u.depositETH,
          isApproved: u.isApproved,
        })),
      });

      return activeUsers;
    } catch (err) {
      log.error("Failed to read registered users from contract", {
        error: err instanceof Error ? err.message : String(err),
        contract: SENTINEL_OPERATOR_ADDRESS,
      });
      return [];
    }
  }

  /**
   * Get total rebalance count from contract.
   */
  async getRebalanceCount(): Promise<number> {
    try {
      const count = await this.contract.getRebalanceCount();
      return Number(count);
    } catch {
      return 0;
    }
  }

  /**
   * Get current rebalance fee in ETH.
   */
  async getRebalanceFee(): Promise<string> {
    try {
      const fee = await this.contract.rebalanceFee();
      return ethers.formatEther(fee);
    } catch {
      return "0.0005";
    }
  }
}

export const operatorReader = new OperatorReader();