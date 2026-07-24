import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes.js";
import { ensureEncryptionKey, ensureJwtSecret } from "./crypto.js";
import { resumePendingCashOuts } from "./services/anchorWithdraw.js";

// Make sure runtime secrets exist (created + persisted on first run).
ensureEncryptionKey();
ensureJwtSecret();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

app.get("/", (_req, res) => res.json({ service: "tani-api", network: config.network }));

app.listen(config.port, () => {
  console.log(`Tani API on http://localhost:${config.port}  (network: ${config.network})`);
  if (!config.assetIssuer) {
    console.log("  ! ASSET_ISSUER not set — run `npm run seed` to provision the demo.");
  }
  // Re-attach pollers to any cash-out interrupted by the previous shutdown/redeploy.
  resumePendingCashOuts().catch((e) => console.error("resumePendingCashOuts", e));
});
