// ============================================================
// SentinelLP — Telegram Client
//
// Sends notifications to subscribed chats when the agent
// rebalances a position. Also runs a simple polling listener
// for /start <wallet> commands to register subscriptions.
// ============================================================

import axios from "axios";
import { log } from "../config/logger";
import { subscribeWallet, getSubscribersForWallet } from "./subscribers";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let lastUpdateId = 0;

/**
 * Send a message to a specific Telegram chat.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    log.debug("Telegram not configured — skipping notification");
    return;
  }

  try {
    await axios.post(`${API_BASE}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    });
  } catch (err) {
    log.warn("Failed to send Telegram message", {
      error: err instanceof Error ? err.message : String(err),
      chatId,
    });
  }
}

/**
 * Notify all subscribers of a wallet that a rebalance happened.
 */
export async function notifyRebalance(
  walletAddress: string,
  tokenId: string,
  reasoning: string,
  txHash: string | undefined,
  network: string
): Promise<void> {
  const chatIds = getSubscribersForWallet(walletAddress);

  if (chatIds.length === 0) {
    log.debug(`No Telegram subscribers for wallet ${walletAddress}`);
    return;
  }

  const explorerBase = network === "1" ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  const txLink = txHash ? `${explorerBase}/tx/${txHash}` : "pending";

  const message =
    `🛡️ *SentinelLP Rebalance*\n\n` +
    `Position #${tokenId} has been rebalanced.\n\n` +
    `_${reasoning}_\n\n` +
    `🔗 [View Transaction](${txLink})`;

  for (const chatId of chatIds) {
    await sendTelegramMessage(chatId, message);
  }

  log.info(`Sent rebalance notification to ${chatIds.length} Telegram subscriber(s)`);
}

/**
 * Poll Telegram for new messages and process /start commands.
 * Run this in a loop separate from the main agent cycle.
 *
 * Usage in bot: /start 0xYourWalletAddress
 */
export async function pollTelegramUpdates(): Promise<void> {
  if (!BOT_TOKEN) return;

  try {
    const res = await axios.get(`${API_BASE}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 0 },
    });

    const updates = res.data.result ?? [];

    if (updates.length > 0) {
      log.info(`Telegram: received ${updates.length} update(s)`);
    }

    for (const update of updates) {
      lastUpdateId = update.update_id;

      const message = update.message;
      if (!message?.text) continue;

      const chatId = String(message.chat.id);
      const text = message.text.trim();

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const walletArg = parts[1];

        if (walletArg && /^0x[a-fA-F0-9]{40}$/.test(walletArg)) {
          subscribeWallet(chatId, walletArg);
          await sendTelegramMessage(
            chatId,
            `✅ Subscribed!\n\nYou'll receive notifications when SentinelLP rebalances:\n\`${walletArg}\``
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `👋 Welcome to SentinelLP!\n\n` +
            `To subscribe to rebalance notifications, send:\n` +
            `\`/start 0xYourWalletAddress\`\n\n` +
            `Or connect via the dashboard for a one-click link.`
          );
        }
      }
    }
  } catch (err) {
    log.warn("Telegram poll error", {
      error: err instanceof Error ? err.message : String(err),
      response: axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : undefined,
    });
  }
}