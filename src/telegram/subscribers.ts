// ============================================================
// SentinelLP — Telegram Subscriber Store
//
// Maps Telegram chat IDs to the wallet addresses they want
// notified about. One chat can subscribe to multiple wallets.
// ============================================================

import fs from "fs";
import path from "path";
import { log } from "../config/logger";

const STORE_FILE = path.join("logs", "telegram-subscribers.json");

interface SubscriberStore {
  [chatId: string]: string[];
}

function readStore(): SubscriberStore {
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeStore(store: SubscriberStore): void {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function subscribeWallet(chatId: string, walletAddress: string): void {
  const store = readStore();
  const normalized = walletAddress.toLowerCase();

  if (!store[chatId]) store[chatId] = [];

  if (!store[chatId].includes(normalized)) {
    store[chatId].push(normalized);
    writeStore(store);
    log.info(`Telegram chat ${chatId} subscribed to wallet ${walletAddress}`);
  }
}

export function unsubscribeWallet(chatId: string, walletAddress: string): void {
  const store = readStore();
  const normalized = walletAddress.toLowerCase();

  if (store[chatId]) {
    store[chatId] = store[chatId].filter((w) => w !== normalized);
    writeStore(store);
  }
}

export function getSubscribersForWallet(walletAddress: string): string[] {
  const store = readStore();
  const normalized = walletAddress.toLowerCase();
  const chatIds: string[] = [];

  for (const [chatId, wallets] of Object.entries(store)) {
    if (wallets.includes(normalized)) {
      chatIds.push(chatId);
    }
  }

  return chatIds;
}

export function getWalletsForChat(chatId: string): string[] {
  const store = readStore();
  return store[chatId] ?? [];
}