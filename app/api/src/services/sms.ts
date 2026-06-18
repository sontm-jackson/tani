import { config, twilioConfigured, speedSmsConfigured } from "../config.js";

// Send an SMS. Provider order: SpeedSMS (Vietnam) → Twilio (international) → dev console.
// Returns whether it was actually handed to a carrier.
export async function sendSms(to: string, body: string): Promise<{ delivered: boolean }> {
  if (speedSmsConfigured) return sendViaSpeedSms(to, body);
  if (twilioConfigured) return sendViaTwilio(to, body);
  console.log(`[sms:dev] to ${to}: ${body}`);
  return { delivered: false };
}

// SpeedSMS.vn — https://api.speedsms.vn/index.php/sms/send
// Basic auth: token as username, "x" as password.
async function sendViaSpeedSms(to: string, body: string): Promise<{ delivered: boolean }> {
  const auth = Buffer.from(`${config.speedsms.token}:x`).toString("base64");
  const payload: Record<string, unknown> = {
    to: [to],
    content: body,
    sms_type: config.speedsms.smsType,
  };
  if (config.speedsms.sender) payload.sender = config.speedsms.sender;

  const res = await fetch("https://api.speedsms.vn/index.php/sms/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.status !== "success") {
    throw new Error(`SpeedSMS send failed: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { delivered: true };
}

// Twilio — international fallback.
async function sendViaTwilio(to: string, body: string): Promise<{ delivered: boolean }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.sid}/Messages.json`;
  const auth = Buffer.from(`${config.twilio.sid}:${config.twilio.token}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: config.twilio.from, Body: body }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio send failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return { delivered: true };
}
