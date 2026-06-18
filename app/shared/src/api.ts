// Shared API client used by both the operator and farmer apps.
// Base URL: in dev it's "/api" (each app's Vite proxy forwards to the backend).
// In production set VITE_API_URL to the API origin, e.g. https://api.tani.app
const origin = (import.meta as any).env?.VITE_API_URL ?? "";
const base = `${origin}/api`;

const TOKEN_KEY = "tani_token";
function token(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function req(path: string, opts?: RequestInit) {
  const t = token();
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => req("/health"),
  operator: () => req("/operator"),

  // ---- farmer auth (phone OTP) ----
  hasToken: () => !!token(),
  setToken: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clearToken: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
  requestOtp: (phone: string) => req("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) => req("/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) }),
  firebaseLogin: (idToken: string) => req("/auth/firebase", { method: "POST", body: JSON.stringify({ idToken }) }),

  // ---- signed-in farmer (token-scoped) ----
  me: () => req("/me"),
  meCashout: (amount: number) => req("/me/cashout", { method: "POST", body: JSON.stringify({ amount }) }),
  meSetPayout: (body: { payoutType: string; payoutProvider: string; payoutAccount: string; payoutName: string }) =>
    req("/me/payout-method", { method: "POST", body: JSON.stringify(body) }),
  meShipments: () => req("/me/shipments"),
  meCreateShipment: (body: any) => req("/me/shipments", { method: "POST", body: JSON.stringify(body) }),
  anchorInfo: () => req("/anchor/info"),
  fundPool: (amount: number) =>
    req("/pool/fund", { method: "POST", body: JSON.stringify({ amount }) }),
  addFarmer: (body: { name: string; phone: string; village?: string }) =>
    req("/farmers", { method: "POST", body: JSON.stringify(body) }),
  createLot: (body: { code: string; commodity: string; contributions: { farmerId: string; quantityKg: number }[] }) =>
    req("/lots", { method: "POST", body: JSON.stringify(body) }),
  createRule: (body: { name: string; eventType?: string; commodity: string; ratePerKg: number }) =>
    req("/rules", { method: "POST", body: JSON.stringify(body) }),
  farmers: () => req("/farmers"),
  farmer: (id: string) => req(`/farmers/${id}`),
  farmerByPhone: (phone: string) => req(`/farmers/by-phone/${encodeURIComponent(phone)}`),
  cashOut: (id: string, amount: number) =>
    req(`/farmers/${id}/cashout`, { method: "POST", body: JSON.stringify({ amount }) }),
  setPayoutMethod: (id: string, body: { payoutType: string; payoutProvider: string; payoutAccount: string; payoutName: string }) =>
    req(`/farmers/${id}/payout-method`, { method: "POST", body: JSON.stringify(body) }),
  lots: () => req("/lots"),
  verifyLot: (id: string) => req(`/lots/${id}/verify`, { method: "POST" }),
  shipments: (status?: string) => req(`/shipments${status ? `?status=${status}` : ""}`),
  shipmentByToken: (token: string) => req(`/shipments/by-token/${encodeURIComponent(token)}`),
  createShipment: (body: any) => req("/shipments", { method: "POST", body: JSON.stringify(body) }),
  verifyShipment: (id: string, body: any) =>
    req(`/shipments/${id}/verify`, { method: "POST", body: JSON.stringify(body) }),
  rules: () => req("/rules"),
  disbursements: () => req("/disbursements"),
};

export function fmtUsdc(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
export function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN");
}
