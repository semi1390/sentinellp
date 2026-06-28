// ============================================================
// SentinelLP — Logger
// Structured logging via Winston. Writes to console + file.
// ============================================================

import winston from "winston";
import path from "path";
import fs from "fs";
import { LOG_LEVEL, LOG_FILE } from "../config";

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, colorize, printf, json } = winston.format;

// Human-readable format for console
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : "";
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    // Console: human-readable with color
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: "HH:mm:ss" }),
        consoleFormat
      ),
    }),
    // File: structured JSON for parsing and audit
    new winston.transports.File({
      filename: LOG_FILE,
      format: combine(timestamp(), json()),
    }),
  ],
});

// Convenience helpers
export const log = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    logger.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) =>
    logger.error(msg, meta ?? {}),
  debug: (msg: string, meta?: Record<string, unknown>) =>
    logger.debug(msg, meta ?? {}),
};
