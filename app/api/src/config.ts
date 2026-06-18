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

  // SMS delivery. If no provider is set, OTP runs in dev mode (code logged + returned).
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID ?? "",
    token: process.env.TWILIO_AUTH_TOKEN ?? "",
    from: process.env.TWILIO_FROM ?? "",
  },
  // SpeedSMS.vn — Vietnamese gateway. sms_type 4 = default notify brand (no own
  // brandname needed); 3 = your registered brandname (set SPEEDSMS_SENDER).
  speedsms: {
    token: process.env.SPEEDSMS_TOKEN ?? "",
    smsType: Number(process.env.SPEEDSMS_SMS_TYPE ?? 4),
    sender: process.env.SPEEDSMS_SENDER ?? "",
  },
};

export const twilioConfigured = Boolean(config.twilio.sid && config.twilio.token && config.twilio.from);
export const speedSmsConfigured = Boolean(config.speedsms.token);
export const smsConfigured = twilioConfigured || speedSmsConfigured;

// Firebase (handles phone OTP delivery on the client; backend verifies the ID token).
export const firebase = {
  projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  // Stored with literal \n in .env — restore real newlines.
  privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};
export const firebaseConfigured = Boolean(firebase.projectId && firebase.clientEmail && firebase.privateKey);

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
