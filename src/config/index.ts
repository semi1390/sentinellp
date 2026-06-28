// ============================================================
// SentinelLP — Config
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

// --- Ethereum RPC ---
export const ETH_RPC_URL = requireEnv("ETH_RPC_URL");

// --- Wallet ---
export const WALLET_ADDRESS = requireEnv("WALLET_ADDRESS");

// --- KeeperHub ---
export const KEEPERHUB_API_KEY = requireEnv("KEEPERHUB_API_KEY");
export const KEEPERHUB_WALLET_ID = optionalEnv("KEEPERHUB_WALLET_ID", "");

// --- Claude ---
export const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");

// --- SentinelLP Operator Contract ---
export const SENTINEL_OPERATOR_ADDRESS = optionalEnv(
  "SENTINEL_OPERATOR_ADDRESS",
  "0xd38Cc0d7dF6c3947BDA0F170bB4a9C5EC164BFf4"
);

// --- Uniswap v3 ---
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