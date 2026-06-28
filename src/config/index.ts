// ============================================================
// SentinelLP — Config
// Loads .env, validates required fields, exports typed config
// ============================================================

import * as dotenv from "dotenv";
import { SentinelConfig } from "../types";

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Check your .env file against .env.example`
    );
  }
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// --- Ethereum RPC (read-only, for position monitoring) ---
export const ETH_RPC_URL = requireEnv("ETH_RPC_URL");

// --- Wallet address we're monitoring (READ ONLY — KeeperHub Turnkey wallet executes) ---
export const WALLET_ADDRESS = requireEnv("WALLET_ADDRESS");

// --- KeeperHub ---
// API key: Settings > API Keys > Organisation tab > Create (kh_ prefix)
export const KEEPERHUB_API_KEY = requireEnv("KEEPERHUB_API_KEY");
// Wallet ID: get it by running `npm run get-wallet` or from Settings > Integrations
export const KEEPERHUB_WALLET_ID = requireEnv("KEEPERHUB_WALLET_ID");

// --- Claude ---
export const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");

// --- Uniswap v3 Contract Addresses (Ethereum Mainnet) ---
export const UNISWAP_POSITION_MANAGER = optionalEnv(
  "UNISWAP_POSITION_MANAGER",
  "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"
);
export const UNISWAP_FACTORY = optionalEnv(
  "UNISWAP_FACTORY",
  "0x1F98431c8aD98523631AE4a59f267346ea31F984"
);

// --- Agent Behaviour ---
export const POLL_INTERVAL_MINUTES = parseInt(
  optionalEnv("POLL_INTERVAL_MINUTES", "5"), 10
);
export const OUT_OF_RANGE_THRESHOLD_POLLS = parseInt(
  optionalEnv("OUT_OF_RANGE_THRESHOLD_POLLS", "2"), 10
);
export const MIN_POSITION_VALUE_USD = parseInt(
  optionalEnv("MIN_POSITION_VALUE_USD", "500"), 10
);

// --- Network ---
// "11155111" = Sepolia testnet (start here)
// "1" = Ethereum mainnet (switch for competition)
export const TARGET_NETWORK = optionalEnv("TARGET_NETWORK", "11155111");

// --- Logging ---
export const LOG_LEVEL = optionalEnv("LOG_LEVEL", "info");
export const LOG_FILE = optionalEnv("LOG_FILE", "logs/sentinellp.log");

export const config: SentinelConfig = {
  walletAddress: WALLET_ADDRESS,
  pollIntervalMinutes: POLL_INTERVAL_MINUTES,
  outOfRangeThresholdPolls: OUT_OF_RANGE_THRESHOLD_POLLS,
  minPositionValueUSD: MIN_POSITION_VALUE_USD,
  rpcUrl: ETH_RPC_URL,
};
