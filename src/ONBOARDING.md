# 🚀 SentinelLP — Onboarding Guide

> From zero to autonomous LP agent in 10 minutes.

This guide walks you through setting up SentinelLP from scratch. No prior KeeperHub experience needed.

---

## What You'll Need

- A computer with Node.js 18+ installed
- ~$20 worth of ETH (for your first real LP position)
- 10 minutes

---

## Step 1 — Get Your API Keys (3 minutes)

You need three API keys. Get them in this order:

### A. Alchemy (Ethereum RPC)
1. Go to [alchemy.com](https://alchemy.com) → Sign up free
2. Create App → Select **Ethereum** → **Mainnet**
3. Copy the HTTPS URL — looks like:
   `https://eth-mainnet.g.alchemy.com/v2/abc123...`

### B. KeeperHub (Onchain Execution)
1. Go to [app.keeperhub.com](https://app.keeperhub.com) → Sign up
2. KeeperHub will automatically create a **Turnkey EOA wallet** for you
3. Go to **Settings → API Keys → Organisation tab → Create New Key**
4. Copy the key — starts with `kh_`

> 💡 Your KeeperHub Turnkey wallet is a hardware-backed wallet that signs all transactions. You never expose a private key.

### C. Anthropic (Claude AI)
1. Go to [console.anthropic.com](https://console.anthropic.com) → Sign up
2. Go to **API Keys → Create Key**
3. Copy the key — starts with `sk-ant-`

---

## Step 2 — Fund Your KeeperHub Wallet (2 minutes)

SentinelLP uses your KeeperHub Turnkey wallet to hold LP positions and execute transactions.

1. In the KeeperHub dashboard, click your wallet icon (top right)
2. Select **Turnkey EOA → Assets → Ethereum**
3. Copy your wallet address (0x...)
4. Send a small amount of ETH to this address
   - For **testnet (Sepolia)**: get free ETH at [sepoliafaucet.com](https://sepoliafaucet.com)
   - For **mainnet**: send ~$20 worth of ETH from any exchange

> 💡 Start with Sepolia testnet — it's free and works identically to mainnet.

---

## Step 3 — Install SentinelLP (1 minute)

```bash
git clone https://github.com/semi1390/sentinellp.git
cd sentinellp
npm install
```

---

## Step 4 — Configure (2 minutes)

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# From Step 1A — your Alchemy URL
ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# From Step 2 — your KeeperHub Turnkey wallet address
WALLET_ADDRESS=0xYOUR_KEEPERHUB_WALLET_ADDRESS

# From Step 1B — your KeeperHub API key
KEEPERHUB_API_KEY=kh_your_key_here

# From Step 1C — your Anthropic API key
ANTHROPIC_API_KEY=sk-ant-your_key_here

# Start on testnet (free). Change to 1 for mainnet.
TARGET_NETWORK=11155111
```

> ⚠️ Never commit your `.env` file. It's already in `.gitignore`.

---

## Step 5 — Verify Setup (30 seconds)

```bash
npm run check
```

You should see all green:

```
✅ ETH_RPC_URL
✅ WALLET_ADDRESS
✅ KEEPERHUB_API_KEY
✅ ANTHROPIC_API_KEY
✅ Connected to sepolia (chainId: 11155111)
✅ KeeperHub API authenticated
✅ Claude API working: "SentinelLP ready"
```

---

## Step 6 — Open a Uniswap v3 LP Position (2 minutes)

SentinelLP monitors Uniswap v3 positions. You need at least one.

1. Go to [app.uniswap.org](https://app.uniswap.org)
2. Connect your **KeeperHub Turnkey wallet** via MetaMask
   - Export your private key from KeeperHub: Settings → Export Private Key
   - Import into MetaMask
3. Switch MetaMask to **Sepolia** network
4. Click **Pool → New Position**
5. Select **USDC / WETH → 1% fee tier**
6. Set a price range (use "Stable" preset for a tight range)
7. Deposit a small amount → Confirm

> 💡 A tight range will go out of range faster — great for testing the agent.

---

## Step 7 — Run the Agent

```bash
npm run agent
```

The agent will:
1. Find your LP position automatically
2. Check if it's in range every 5 minutes
3. Ask Claude to reason about the economics
4. Execute a rebalance through KeeperHub if needed

**Example output:**
```
[info] 🛡️  SentinelLP starting up...
[info] Chainlink ETH/USD: $2,847.32
[info] ─── Checking position #229664 (USDC/WETH) ───
[info] Status: IN_RANGE — earning fees ✓
[info] Decision: HOLD (HIGH confidence)
```

---

## Step 8 — View Your Audit Trail

```bash
npm run audit
```

See every decision the agent has made, with transaction hashes and Etherscan links.

---

## Switching to Mainnet

When you're ready to use real money:

1. Change `.env`:
```env
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
TARGET_NETWORK=1
```

2. Fund your KeeperHub wallet with ETH on mainnet
3. Open a Uniswap v3 position on mainnet
4. Run `npm run agent`

That's it — the agent works identically on mainnet.

---

## Troubleshooting

**"No LP positions found"**
→ Make sure your LP position was opened from your KeeperHub wallet address (same as `WALLET_ADDRESS` in `.env`)

**"KeeperHub API key invalid"**
→ Make sure you're using the **Organisation** API key (not personal). Go to Settings → API Keys → Organisation tab.

**"Could not decode result data"**
→ Your `ETH_RPC_URL` is pointing to the wrong network. Sepolia RPC for testnet, mainnet RPC for mainnet.

**Agent keeps saying WAIT**
→ Normal behavior when position value is low. The agent only rebalances when the economics justify it (daily fee loss > gas cost).

---

## How KeeperHub Powers SentinelLP

Every rebalance executes 5 onchain transactions through KeeperHub:

```
1. decreaseLiquidity  — remove liquidity from old range
2. collect            — pull tokens + fees to wallet
3. approve USDC       — allow Position Manager to spend USDC
4. approve WETH       — allow Position Manager to spend WETH
5. mint               — open new position at optimal range
```

KeeperHub handles:
- ⛽ **Gas sponsorship** — no ETH management headaches
- 🛡️ **MEV protection** — private mempool routing
- 🔄 **Retry logic** — exponential backoff on failures
- 📋 **Audit trail** — every step logged with tx hash

---

*Questions? Open an issue at [github.com/semi1390/sentinellp](https://github.com/semi1390/sentinellp)*