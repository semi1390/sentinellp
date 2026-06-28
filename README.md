# 🛡️ SentinelLP

> Autonomous Uniswap v3 LP position risk agent powered by KeeperHub onchain execution.

SentinelLP monitors your Uniswap v3 liquidity positions 24/7. When a position goes out of range (stops earning fees), Claude reasons about whether to rebalance — and if so, executes the 3-step workflow through KeeperHub with MEV protection, gas estimation, retry logic, and a full audit trail.

Built for the **KeeperHub "Agents Onchain" hackathon** on DoraHacks (July 27 – August 13, 2026).

---

## How It Works

```
Every N minutes:
  1. Read LP positions from Uniswap v3 (NonfungiblePositionManager)
  2. Check if currentTick is inside [tickLower, tickUpper]
  3. If out of range: ask Claude to reason about the economics
  4. If Claude says REBALANCE: submit 3-step workflow to KeeperHub
       Step 1: decreaseLiquidity (remove from current range)
       Step 2: collect (collect tokens + fees)
       Step 3: mint (deposit at new centered range)
  5. KeeperHub handles: gas, retries, MEV protection, audit trail
  6. Record everything locally + link to KeeperHub audit trail
```

---

## Project Structure

```
sentinellp/
├── src/
│   ├── types.ts                    # All shared TypeScript types
│   ├── index.ts                    # Entry point
│   ├── config/
│   │   ├── index.ts                # Env var loader + typed config
│   │   └── logger.ts               # Winston logger
│   ├── uniswap/
│   │   └── positionReader.ts       # Read-only chain queries
│   ├── agent/
│   │   ├── healthAssessor.ts       # Position health logic
│   │   ├── brain.ts                # Claude-powered decision making
│   │   ├── auditTrail.ts           # Local audit log (JSONL)
│   │   └── loop.ts                 # Main monitoring loop
│   ├── keeperhub/
│   │   └── client.ts               # KeeperHub API wrapper
│   └── scripts/
│       └── healthcheck.ts          # Pre-flight setup check
├── logs/
│   ├── sentinellp.log              # Structured log output
│   └── audit.jsonl                 # Agent decision audit trail
├── .env.example                    # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

You need:
- **Alchemy/Infura key** → `ETH_RPC_URL` (free tier works)
- **Wallet private key** → `WALLET_PRIVATE_KEY` (use a fresh wallet for testing)
- **KeeperHub API key** → Get at [keeperhub.io](https://keeperhub.io)
- **Anthropic API key** → Get at [console.anthropic.com](https://console.anthropic.com)

### 3. Run pre-flight checks

```bash
npm run check
```

This verifies every external dependency before you run the agent.

### 4. Start the agent

```bash
npm run agent
```

---

## Key Concepts: Uniswap v3 Ticks (read once)

Uniswap v3 uses "ticks" to represent prices. The math sounds scary but you only need to know:

- Every LP position has a `tickLower` and `tickUpper` defining its price range
- The pool has a `currentTick` representing the current price
- **If `tickLower <= currentTick <= tickUpper` → IN RANGE → earning fees ✅**
- **If `currentTick < tickLower` or `currentTick > tickUpper` → OUT OF RANGE → earning nothing ❌**
- Ticks are just `log(price) / log(1.0001)` — the exact math is handled by the contracts

That's all SentinelLP needs to know to decide when to act.

---

## KeeperHub Integration

KeeperHub handles everything after the decision is made:

| KeeperHub Feature | How SentinelLP Uses It |
|---|---|
| Workflow builder | Chains the 3-step rebalance (decrease → collect → mint) |
| Gas estimation | Estimates rebalance cost to check if it's worth it |
| Exponential backoff | Retries if a step fails at the wrong moment |
| Private routing | MEV protection on LP operations (critical — bots watch these) |
| Audit trail | Proof of execution for demo + user trust |
| x402 / MPP | Pay-per-execution billing |

---

## Build Roadmap

### Week 1 (July 27 – Aug 2): Foundation
- [ ] KeeperHub API key → fill in real endpoints in `src/keeperhub/client.ts`
- [ ] Run `npm run check` → all green
- [ ] Deploy a real test LP position on mainnet
- [ ] Agent reads the position correctly
- [ ] First rebalance workflow submitted to KeeperHub
- [ ] **Milestone: Link a real transaction the agent executed**

### Week 2 (Aug 3 – 9): Reliability + Observability
- [ ] Real gas cost from KeeperHub (replace $15 placeholder)
- [ ] Real USD values from Chainlink price feeds
- [ ] Real fee APR from Uniswap subgraph
- [ ] Slippage protection on mint/decrease params
- [ ] `COLLECT_FEES` workflow
- [ ] React dashboard (optional but good for demo video)

### Week 2.5 (Aug 10 – 13): Polish + Submission
- [ ] Record demo video
- [ ] Collect 3+ real transactions for the submission link
- [ ] Clean up README for judges
- [ ] Submit on DoraHacks before August 13

---

## Code Review Prompt

When reviewing this codebase with Claude, paste this first:

```
You are a senior Ethereum DeFi engineer reviewing SentinelLP,
a Uniswap v3 LP monitoring agent that executes rebalances via KeeperHub.

Review focus areas:
1. Correctness: Are the Uniswap v3 position reads accurate?
2. Safety: Are there any footguns in the rebalance workflow params?
3. Reliability: Will the agent handle RPC failures, gas spikes, and KeeperHub errors gracefully?
4. KeeperHub usage: Are we using KeeperHub's surfaces well (MCP, workflow, audit)?
5. Hackathon angle: What would a judge think is missing?

Be specific. Point to file names and line numbers. Don't be nice — be useful.
```

---

## Hackathon Submission Checklist

- [ ] GitHub repo (public)
- [ ] Demo video showing agent detecting out-of-range position and rebalancing
- [ ] Link to actual transaction the agent executed (Etherscan)
- [ ] Link to KeeperHub audit trail for that transaction
- [ ] README explains the KeeperHub integration clearly

---

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript
- **Chain reads**: ethers.js v6
- **Agent brain**: Claude claude-sonnet-4-6 via Anthropic SDK
- **Execution layer**: KeeperHub (MCP + workflow builder + audit trail)
- **Scheduling**: node-cron
- **Logging**: Winston
- **Target network**: Ethereum Mainnet
