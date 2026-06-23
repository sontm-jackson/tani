import { createKeypair, fundWithFriendbot, setTrustline } from "./account.js";
import { anchorUsdc } from "./client.js";
import {
  resolveAnchor,
  sep10Authenticate,
  sep24WithdrawInteractive,
  sep24Transaction,
} from "./anchorSep.js";

// Proves the raw SEP-10 + SEP-24 withdraw protocol works against the live anchor,
// without touching the app DB. Run: npm run anchor:smoke
//
// It can prove everything up to the interactive handoff headlessly:
//   1. resolve endpoints from the anchor TOML
//   2. SEP-10 authenticate a fresh account -> JWT
//   3. SEP-24 withdraw/interactive -> hosted URL + transaction id
//   4. poll the transaction (status "incomplete" until a human finishes the webview)
// The send-and-settle leg needs the interactive step + anchor USDC, which is the
// live-demo moment, not something a headless script can complete.

async function main() {
  console.log("1. Resolving anchor endpoints from TOML...");
  const a = await resolveAnchor();
  console.log("   web_auth:", a.webAuth);
  console.log("   sep24:   ", a.sep24);
  console.log("   signing: ", a.signingKey);

  console.log("2. Creating + funding a fresh testnet account...");
  const kp = createKeypair();
  await fundWithFriendbot(kp.publicKey);
  console.log("   account:", kp.publicKey);

  console.log("3. Trustline to anchor USDC...");
  await setTrustline(kp.secret, anchorUsdc());
  console.log("   ok");

  console.log("4. SEP-10 authenticate...");
  const token = await sep10Authenticate(kp.secret);
  console.log("   JWT:", token.slice(0, 24) + "... (" + token.length + " chars)");

  console.log("5. SEP-24 withdraw/interactive...");
  const w = await sep24WithdrawInteractive(token, kp.publicKey, 10);
  console.log("   type:", w.type);
  console.log("   id:  ", w.id);
  console.log("   url: ", w.url);

  console.log("6. Poll transaction by id...");
  const tx = await sep24Transaction(token, w.id);
  console.log("   status:", tx.status);
  console.log("   kind:  ", tx.kind);
  console.log(
    "   anchor_account:",
    tx.withdraw_anchor_account ?? "(not set until interactive step is completed)"
  );

  console.log("\nOK — SEP-10 auth + SEP-24 initiate + transaction query all work.");
  console.log("Open the url above in a browser to finish the interactive withdraw.");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
