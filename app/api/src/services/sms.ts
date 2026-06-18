import { config, smsConfigured } from "../config.js";

// Send an SMS. Uses Twilio if configured; otherwise logs to the console (dev mode).
// Returns whether it was actually delivered to a carrier.
export async function sendSms(to: string, body: string): Promise<{ delivered: boolean }> {
  if (!smsConfigured) {
    console.log(`[sms:dev] to ${to}: ${body}`);
    return { delivered: false };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.sid}/Messages.json`;
  const auth = Buffer.from(`${config.twilio.sid}:${config.twilio.token}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: config.twilio.from, Body: body }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SMS send failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return { delivered: true };
}
