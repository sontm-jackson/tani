import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes.js";

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
});
