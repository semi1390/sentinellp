// ============================================================
// SentinelLP — Get KeeperHub Wallet ID
// Gets the web3 wallet integration ID needed for write-contract
// Usage: npm run get-wallet
// ============================================================

import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) { console.error("❌ KEEPERHUB_API_KEY not set"); process.exit(1); }

  console.log("\n🔍 Fetching web3 wallet integrations from KeeperHub...\n");

  try {
    const res = await axios.get("https://app.keeperhub.com/api/integrations?type=web3", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const integrations = res.data?.data ?? [];

    if (integrations.length === 0) {
      console.log("❌ No web3 wallet integrations found.");
      console.log("→ Go to app.keeperhub.com → Settings → Wallets and connect your Turnkey wallet.");
      return;
    }

    console.log(`Found ${integrations.length} wallet(s):\n`);
    for (const i of integrations) {
      console.log(`  ID:   ${i.id}   ← copy this into KEEPERHUB_WALLET_ID in .env`);
      console.log(`  Name: ${i.name ?? "(unnamed)"}`);
      console.log(`  Type: ${i.type}`);
      console.log();
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error(`❌ ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    } else {
      console.error(err);
    }
  }
}

main();