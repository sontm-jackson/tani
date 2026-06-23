// Fund the anchor cash-out treasury with anchor USDC by BUYING it on the testnet DEX
// with the treasury's XLM. This replaces the SEP-24 anchor deposit, which is unreliable
// on testnet (testanchor's USDC distribution account is frequently drained, so deposits
// error with "resulting balance is not within the allowed range"). A withdraw still goes
// through the real anchor — we only need anchor USDC in the treasury, and the DEX has it.
// Run: npm run fund:treasury           (default target 20 USDC)
//      npm run fund:treasury -- 40
import { Keypair, Operation, TransactionBuilder, BASE_FEE, Asset } from "@stellar/stellar-sdk";
import { config, networkPassphrase } from "./config.js";
import { horizon, anchorUsdc } from "./stellar/client.js";
import { getAssetBalance } from "./stellar/account.js";

async function main() {
  const target = Number(process.argv[2] ?? 20);
  if (!config.treasurySecret || !config.treasuryPublic) {
    throw new Error("Treasury not set up — run `npm run seed` first.");
  }
  let bal = await getAssetBalance(config.treasuryPublic, config.assetCode, config.anchorUsdcIssuer);
  console.log(`Treasury anchor-USDC = ${bal} (target ${target})`);
  if (bal >= target) {
    console.log("Already funded. Cash-out withdrawals can settle.");
    return;
  }

  const need = Number((target - bal).toFixed(7));
  const kp = Keypair.fromSecret(config.treasurySecret);
  const account = await horizon.loadAccount(kp.publicKey());
  const sendMax = Math.max(10, Math.ceil(need * 50)); // generous XLM cap; DEX price varies

  console.log(`Buying ${need} USDC on the DEX (paying up to ${sendMax} XLM)...`);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: String(sendMax),
        destination: kp.publicKey(),
        destAsset: anchorUsdc(),
        destAmount: need.toFixed(7),
        path: [],
      })
    )
    .setTimeout(60)
    .build();
  tx.sign(kp);

  try {
    const res = await horizon.submitTransaction(tx);
    console.log("Bought USDC. tx:", res.hash);
  } catch (e: any) {
    const codes = e?.response?.data?.extras?.result_codes;
    console.error("DEX buy failed:", codes ? JSON.stringify(codes) : e?.message ?? e);
    console.error("(If op_under_dest_min / too_few_offers, DEX liquidity is thin — try a smaller target.)");
    process.exit(1);
  }

  bal = await getAssetBalance(config.treasuryPublic, config.assetCode, config.anchorUsdcIssuer);
  console.log(`\nTreasury anchor-USDC = ${bal}`);
  console.log(bal >= target ? "Treasury funded. Cash-out withdrawals can now settle." : "Still under target.");
}

main().catch((e) => {
  console.error("fund:treasury failed:", e);
  process.exit(1);
});
