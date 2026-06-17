import { Horizon, Asset } from "@stellar/stellar-sdk";
import { config } from "../config.js";

export const horizon = new Horizon.Server(config.horizonUrl);

// The asset settled to farmers. On testnet, issued by our demo issuer (set by seed).
// In production this is swapped for Circle's real USDC issuer.
export function usdc(): Asset {
  if (!config.assetIssuer) {
    throw new Error(
      "ASSET_ISSUER not set. Run `npm run seed` first to create the demo issuer."
    );
  }
  return new Asset(config.assetCode, config.assetIssuer);
}

export function assetFor(issuer: string): Asset {
  return new Asset(config.assetCode, issuer);
}
