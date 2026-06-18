import "dotenv/config";
import { Networks } from "@stellar/stellar-sdk";

export const config = {
  network: process.env.STELLAR_NETWORK ?? "testnet",
  horizonUrl: process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  friendbotUrl: process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org",
  assetCode: process.env.ASSET_CODE ?? "USDC",
  assetIssuer: process.env.ASSET_ISSUER ?? "",
  issuerSecret: process.env.ISSUER_SECRET ?? "",
  anchorHomeDomain: process.env.ANCHOR_HOME_DOMAIN ?? "testanchor.stellar.org",
  port: Number(process.env.PORT ?? 4000),

  // Auth
  jwtSecret: process.env.JWT_SECRET ?? "",
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),

  // SMS delivery (Twilio). If unset, OTP runs in dev mode (code logged + returned).
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID ?? "",
    token: process.env.TWILIO_AUTH_TOKEN ?? "",
    from: process.env.TWILIO_FROM ?? "",
  },
};

export const smsConfigured = Boolean(config.twilio.sid && config.twilio.token && config.twilio.from);

export const networkPassphrase =
  config.network === "public" ? Networks.PUBLIC : Networks.TESTNET;

// Explorer link helper for the UI.
export function explorerTx(hash: string): string {
  const net = config.network === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

export function explorerAccount(pk: string): string {
  const net = config.network === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/account/${pk}`;
}
