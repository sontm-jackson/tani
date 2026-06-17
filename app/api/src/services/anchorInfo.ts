import { config } from "../config.js";

// Real anchor connectivity (SEP-1): fetch the live stellar.toml from testanchor.stellar.org
// and its SEP-24 /info, to prove genuine anchor integration. Cached for 5 minutes.
let cache: { at: number; data: any } | null = null;

export async function anchorInfo() {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.data;

  const home = config.anchorHomeDomain;
  const tomlUrl = `https://${home}/.well-known/stellar.toml`;
  const out: any = { homeDomain: home, reachable: false, seps: [], currencies: [] };

  try {
    const res = await fetch(tomlUrl);
    if (!res.ok) throw new Error(`toml ${res.status}`);
    const toml = await res.text();
    out.reachable = true;

    const sep24 = field(toml, "TRANSFER_SERVER_SEP0024");
    const sep31 = field(toml, "DIRECT_PAYMENT_SERVER");
    const sep6 = field(toml, "TRANSFER_SERVER");
    const sep10 = field(toml, "WEB_AUTH_ENDPOINT");
    const sep12 = field(toml, "KYC_SERVER");
    if (sep10) out.seps.push("SEP-10 (auth)");
    if (sep12) out.seps.push("SEP-12 (KYC)");
    if (sep6) out.seps.push("SEP-6 (transfer)");
    if (sep24) out.seps.push("SEP-24 (interactive)");
    if (sep31) out.seps.push("SEP-31 (cross-border)");
    out.signingKey = field(toml, "SIGNING_KEY");

    // Asset codes advertised by the anchor.
    out.currencies = [...toml.matchAll(/code\s*=\s*"([^"]+)"/g)].map((m) => m[1]).slice(0, 8);

    if (sep24) {
      try {
        const info = await fetch(`${sep24.replace(/\/$/, "")}/info`);
        if (info.ok) out.sep24Withdrawable = Object.keys((await info.json())?.withdraw ?? {});
      } catch { /* optional */ }
    }
  } catch (e: any) {
    out.error = e?.message ?? String(e);
  }

  cache = { at: Date.now(), data: out };
  return out;
}

function field(toml: string, key: string): string | undefined {
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  return m?.[1];
}
