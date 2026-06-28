// ============================================================
// SentinelLP — Setup Healthcheck
//
// Run this FIRST to verify everything is configured correctly
// before starting the agent.
//
// Usage: npm run check
//
// Checks:
//   ✓ Environment variables are set
//   ✓ Ethereum RPC is reachable
//   ✓ Wallet address is valid
//   ✓ KeeperHub API key works
//   ✓ Claude API key works
//   ✓ Can read LP positions from chain
// ============================================================

import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const CHECK = "✅";
const FAIL = "❌";

async function runChecks(): Promise<void> {
  console.log("\n🛡️  SentinelLP — Pre-flight Checks\n");
  console.log("═".repeat(50));

  let allPassed = true;

  // --- 1. Environment Variables ---
  console.log("\n[1] Environment Variables");
  const required = [
    "ETH_RPC_URL",
    "WALLET_ADDRESS",
    "KEEPERHUB_API_KEY",
    "ANTHROPIC_API_KEY",
  ];

  for (const key of required) {
    if (process.env[key]) {
      const masked = process.env[key]!.slice(0, 6) + "...";
      console.log(`  ${CHECK} ${key} = ${masked}`);
    } else {
      console.log(`  ${FAIL} ${key} is missing`);
      allPassed = false;
    }
  }

  // --- 2. Ethereum RPC ---
  console.log("\n[2] Ethereum RPC Connection");
  try {
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    console.log(`  ${CHECK} Connected to ${network.name} (chainId: ${network.chainId})`);
    console.log(`  ${CHECK} Current block: ${blockNumber}`);
  } catch (err) {
    console.log(`  ${FAIL} RPC connection failed: ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }

  // --- 3. Wallet ---
  console.log("\n[3] Wallet");
  try {
    const address = process.env.WALLET_ADDRESS!;
    const isValid = ethers.isAddress(address);
    if (isValid) {
      console.log(`  ${CHECK} Address is valid: ${address}`);

      const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
      const balance = await provider.getBalance(address);
      const ethBalance = ethers.formatEther(balance);
      console.log(`  ${CHECK} ETH balance: ${parseFloat(ethBalance).toFixed(4)} ETH`);

      if (parseFloat(ethBalance) < 0.01) {
        console.log(`  ⚠️  Low ETH balance — you'll need ETH for gas`);
      }
    } else {
      console.log(`  ${FAIL} Invalid wallet address format`);
      allPassed = false;
    }
  } catch (err) {
    console.log(`  ${FAIL} Wallet check failed: ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }

  // --- 4. KeeperHub API ---
// --- 4. KeeperHub API ---
console.log("\n[4] KeeperHub API");
try {
  const response = await axios.get("https://app.keeperhub.com/api/workflows", {
    headers: { Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}` },
    timeout: 10_000,
  });
  const count = response.data?.data?.length ?? 0;
  console.log(`  ${CHECK} KeeperHub API authenticated`);
  console.log(`  ${CHECK} Workflows in org: ${count}`);
} catch (err) {
  if (axios.isAxiosError(err) && err.response?.status === 401) {
    console.log(`  ${FAIL} KeeperHub API key invalid (401)`);
    allPassed = false;
  } else {
    console.log(`  ${FAIL} KeeperHub API failed: ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }
}

  // --- 5. Claude API ---
  console.log("\n[5] Anthropic / Claude API");
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply with exactly: SentinelLP ready" }],
    });
    const reply = response.content[0].type === "text" ? response.content[0].text : "";
    console.log(`  ${CHECK} Claude API working: "${reply.trim()}"`);
  } catch (err) {
    console.log(`  ${FAIL} Claude API failed: ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }

  // --- 6. Uniswap Position Manager ---
  console.log("\n[6] Uniswap v3 Position Manager");
  try {
    const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
    const abi = ["function balanceOf(address owner) view returns (uint256)"];
    const contract = new ethers.Contract(POSITION_MANAGER, abi, provider);
    const balance = await contract.balanceOf(process.env.WALLET_ADDRESS);
    console.log(`  ${CHECK} Position Manager reachable`);
    console.log(`  ${CHECK} LP positions found: ${balance.toString()}`);
  } catch (err) {
    console.log(`  ${FAIL} Position Manager check failed: ${err instanceof Error ? err.message : String(err)}`);
    allPassed = false;
  }

  // --- Summary ---
  console.log("\n" + "═".repeat(50));
  if (allPassed) {
    console.log(`\n${CHECK} All checks passed! Run: npm run agent\n`);
  } else {
    console.log(`\n${FAIL} Some checks failed. Fix the issues above then re-run: npm run check\n`);
    process.exit(1);
  }
}

runChecks().catch((err) => {
  console.error("Healthcheck crashed:", err.message);
  process.exit(1);
});
