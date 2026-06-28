# 🛡️ SentinelLP

> **Autonomous Uniswap v3 LP rebalancer. Claude reasons. KeeperHub executes.**

SentinelLP is an AI agent that monitors your Uniswap v3 liquidity positions 24/7. When a position goes out of range and stops earning fees, Claude analyzes the economics and decides whether to rebalance. If it does, KeeperHub executes a 6-step onchain workflow — gas sponsored, MEV protected, with a full audit trail.

**Built for the KeeperHub "Agents Onchain" Hackathon — DoraHacks 2026**

---

## 🔗 Verified Onchain Transactions (Sepolia)

Full autonomous rebalance of position #229664 — all steps gas sponsored by KeeperHub:

| Step | Transaction |
|------|-------------|
| Remove Liquidity | [0x601cd7f...](https://sepolia.etherscan.io/tx/0x601cd7f51a55bef1f1ec077d77fdccbd9c03d270b9e11a1cefabcf4aecfe321a) |
| Collect Tokens & Fees | [0x5e60290...](https://sepolia.etherscan.io/tx/0x5e602908f09f8b23247bb936459c3334cc34450a8a10fdac79b802f9f133f022) |
| Approve USDC | [0xeba74e7...](https://sepolia.etherscan.io/tx/0xeba74e7034fcfb24681e324460310142b7151d791a9620bcc16b7b0240f9cefc) |
| Approve WETH | [0x622840...](https://sepolia.etherscan.io/tx/0x622840485d8e92caaad5c77f1de3d14fb48a82dd056ffc33cdeeb132a41fef79) |
| Open New Position | [0xfdd341...](https://sepolia.etherscan.io/tx/0xfdd3415e6ccce93daad9663051db164c3ae51aaaa0789f9d3b62163cffe043ee) |

**KeeperHub Audit Trail:** https://app.keeperhub.com/workflows/1zt1s7n5lf4ifrvda53mu/executions/km8am02t3yzg11xg7zatb

---

## How It Works

```
Every 5 minutes:
│
├── 1. READ — ethers.js reads all Uniswap v3 LP positions from chain
│
├── 2. ASSESS — Is currentTick inside [tickLower, tickUpper]?
│             — How long has it been out of range?
│             — Is rebalancing worth the gas cost? (Chainlink price feeds)
│
├── 3. REASON — Claude (Haiku) gets real position data and decides:
│             — HOLD: position is fine
│             — WAIT: out of range but economics don't justify acting
│             — REBALANCE: act now, here's the new tick range
│
├── 4. BUILD — KeeperHub Client creates a 6-step workflow via REST API:
│             Step 1: decreaseLiquidity
│             Step 2: collect
│             Step 3: approve token0
│             Step 4: approve token1
│             Step 5: mint at new range
│
└── 5. EXECUTE — KeeperHub fires all transactions:
              — Gas sponsored
              — MEV protected (private mempool)
              — Full audit trail per step
              — Exponential backoff on failure
```

---

## KeeperHub Integration

SentinelLP uses KeeperHub as its exclusive execution layer — not as a bolt-on, but as the core of what makes it reliable:

| KeeperHub Feature | How SentinelLP Uses It |
|---|---|
| REST API (`/workflows/create`) | Programmatically builds the 6-step rebalance workflow |
| REST API (`/workflow/{id}/execute`) | Triggers execution from the agent loop |
| REST API (`/workflows/executions/{id}/status`) | Polls until confirmed or failed |
| Gas sponsorship | All transactions gas sponsored — no ETH management needed |
| Private mempool | MEV protection on LP operations (critical — bots watch these) |
| Audit trail | Every step logged with tx hash, gas used, timestamp |
| `web3/write-contract` | Calls decreaseLiquidity, collect, mint on NonfungiblePositionManager |
| `web3/approve-token` | Token approvals before mint |

---

## Project Structure

```
sentinellp/
├── src/
│   ├── types.ts                    # All shared TypeScript types
│   ├── config/
│   │   ├── index.ts                # Env var loader
│   │   └── logger.ts               # Winston structured logging
│   ├── uniswap/
│   │   ├── positionReader.ts       # Read-only chain queries (ethers.js)
│   │   └── priceFeed.ts            # Chainlink price oracles (ETH/USD, USDC/USD)
│   ├── agent/
│   │   ├── healthAssessor.ts       # Position health + real gas cost estimation
│   │   ├── brain.ts                # Claude Haiku reasoning engine
│   │   ├── auditTrail.ts           # Local audit log (JSONL)
│   │   └── loop.ts                 # Main monitoring loop (node-cron)
│   ├── keeperhub/
│   │   └── client.ts               # KeeperHub REST API wrapper
│   └── scripts/
│       ├── healthcheck.ts          # npm run check — pre-flight setup check
│       ├── audit.ts                # npm run audit — decision history CLI
│       └── get-wallet.ts           # npm run get-wallet — find KeeperHub wallet ID
├── logs/
│   ├── sentinellp.log              # Structured log output
│   └── audit.jsonl                 # Agent decision audit trail
├── .env.example
└── README.md
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/semi1390/sentinellp.git
cd sentinellp
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
# Ethereum RPC (free at alchemy.com)
ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# Your wallet address (holds the LP positions)
WALLET_ADDRESS=0xYOUR_ADDRESS

# KeeperHub (app.keeperhub.com → Settings → API Keys → Organisation)
KEEPERHUB_API_KEY=kh_your_key

# Claude (console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-your_key

# Network: 11155111 = Sepolia testnet, 1 = Ethereum mainnet
TARGET_NETWORK=11155111
```

### 3. Pre-flight check

```bash
npm run check
```

All green? You're ready.

### 4. Open a Uniswap v3 LP position

Go to [app.uniswap.org](https://app.uniswap.org) → Pool → New Position → select your pair → confirm.

### 5. Run the agent

```bash
npm run agent
```

### 6. View audit trail

```bash
npm run audit
```

---

## Agent Output Example

```
[info] Chainlink ETH/USD: $2,847.32
[info] ─── Checking position 229664 (USDC/WETH) ───
[warn] Position 229664 out of range
      currentTick: 180109, range: [179800, 181000]
[info] Rebalance economics
      estimatedDailyFeeLossUSD: $3.18
      gasCostUSD: $1.62
      rebalanceWorthIt: true
[info] Agent decided: REBALANCE (HIGH confidence)
      "Position losing $3.18/day vs $1.62 gas cost.
       Recentering around tick 180109 will restore fee generation."
[info] Workflow created: wf_abc123
[info] Execution started: exec_xyz789
[info] ✅ Rebalance confirmed onchain
[info] 🔗 https://sepolia.etherscan.io/tx/0xfdd341...
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent loop | TypeScript / Node.js / node-cron |
| Chain reads | ethers.js v6 |
| Price feeds | Chainlink (ETH/USD, USDC/USD) |
| AI reasoning | Claude Haiku (Anthropic) |
| Onchain execution | KeeperHub (workflow builder + REST API) |
| Target protocol | Uniswap v3 (NonfungiblePositionManager) |
| Network | Ethereum Mainnet / Sepolia |

---

## Hackathon Submission

**GitHub:** https://github.com/semi1390/sentinellp

**Transaction proof:** Position #229664 fully rebalanced onchain via KeeperHub
- All 5 transactions gas sponsored
- Full KeeperHub audit trail available
- Agent made 28 decisions over 2 days of testing

**KeeperHub surfaces used:** REST API (workflow create, execute, poll, logs), `web3/write-contract`, `web3/approve-token`, gas sponsorship, private mempool, audit trail

---
