import { useEffect, useState } from "react";
import { api, fmtUsdc } from "@shared/api";
import { Arrivals } from "./Arrivals";
import { Trace } from "./Trace";
import { FundPool } from "./FundPool";

// Arrivals is the daily workspace (scan -> verify -> pay), so it leads and is the
// default. The batch "Lots" path is hidden from the UI to keep one clear payment
// spine; the lot engine still exists in the API.
const TABS = ["Dashboard", "Trace", "Arrivals", "Approvals", "Farmers", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function Operator({ onLogout }: { onLogout: () => void }) {
  const [op, setOp] = useState<any>(null);
  const [disbs, setDisbs] = useState<any[]>([]);
  const [ships, setShips] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Dashboard");

  async function load() {
    const [o, d, f, r, sh] = await Promise.all([
      api.operator(), api.disbursements(), api.farmers(), api.rules(), api.shipments(),
    ]);
    setOp(o); setDisbs(d); setFarmers(f); setRules(r); setShips(sh);
  }
  useEffect(() => {
    load()
      .catch((e) => { if (e.message === "not signed in") onLogout(); else setNotice({ ok: false, msg: e.message }); })
      .finally(() => setLoading(false));
    api.anchorInfo().then(setAnchor).catch(() => {});
  }, []);

  async function run(key: string, fn: () => Promise<any>, okMsg?: (r: any) => string) {
    setBusy(key); setNotice(null);
    try {
      const r = await fn();
      if (okMsg) setNotice({ ok: true, msg: okMsg(r) });
      await load();
      return r;
    } catch (e: any) {
      setNotice({ ok: false, msg: e.message });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="spin">Loading cooperative…</div>;
  if (!op) return <div className="wrap page"><div className="notice notice-err">No operator. Run <b>npm run seed</b> in app/api.</div></div>;

  const pending = farmers.filter((f) => f.status === "pending");
  const active = farmers.filter((f) => f.status !== "pending");
  const locReqs = farmers.filter((f) => f.pendingLat != null && f.pendingLng != null);
  const todo = pending.length + locReqs.length;

  // dashboard metrics
  const geo = farmers.filter((f) => f.lat != null && f.lng != null).length;
  const coverage = farmers.length ? Math.round((geo / farmers.length) * 100) : 0;
  const payouts = [
    ...disbs.filter((d) => d.status === "success").map((d) => ({
      when: d.createdAt, label: `Lot ${d.lot}`, sub: `${d.payments.length} farmers · batch`, amount: d.totalAmount, explorer: d.explorer,
    })),
    ...ships.filter((s) => s.status === "paid").map((s) => ({
      when: s.createdAt, label: s.farmerName, sub: `${s.variety ?? s.commodity} · ${s.verifiedKg}kg`, amount: s.amountPaid ?? 0, explorer: s.explorer,
    })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  const totalPaid = payouts.reduce((s, p) => s + (p.amount ?? 0), 0);

  return (
    <div className="op-shell">
      <div className="op-bar">
        <div className="wrap op-bar-inner">
          <span className="op-brand">Tani<span className="dot">.</span></span>
          <span className="op-co">{op.name}</span>
          <span className="spacer" />
          <span className="op-pool">Pool <b>{fmtUsdc(op.poolBalance)}</b> USDC</span>
          <span className="badge">testnet</span>
          <button className="op-signout" onClick={onLogout}>Sign out</button>
        </div>
      </div>
      <div className="op-tabs wrap">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}
            {t === "Approvals" && todo > 0 ? <span className="tab-badge">{todo}</span> : null}
          </button>
        ))}
      </div>

      <div className="wrap op-body">
        {notice && <div className={`notice ${notice.ok ? "notice-ok" : "notice-err"}`}>{notice.msg}</div>}

        {tab === "Dashboard" && (
          <>
            <div className="dash-head">
              <div>
                <h2 style={{ margin: 0 }}>Overview</h2>
                <p className="sub" style={{ margin: "2px 0 0" }}>{op.name}</p>
              </div>
              {todo > 0 && (
                <button className="btn-ghost dash-attention" onClick={() => setTab("Approvals")}>
                  {todo} pending approval{todo > 1 ? "s" : ""} →
                </button>
              )}
            </div>

            <div className="card hero dash-pool">
              <div>
                <div className="eyebrow">Payout pool</div>
                <div className="balance">{fmtUsdc(op.poolBalance)}<span>USDC</span></div>
                <div className="meta"><a className="link" href={op.poolExplorer} target="_blank" rel="noreferrer">view pool account on-chain ↗</a></div>
              </div>
              <div className="spacer" />
              <button className="btn-primary" onClick={() => setPanel("fund")}>Fund pool</button>
            </div>

            <div className="kpi-grid">
              <div className="card stat">
                <div className="k">Active farmers</div>
                <div className="v">{active.length}</div>
                <div className="kpi-sub">{pending.length} awaiting approval</div>
              </div>
              <div className="card stat">
                <div className="k">Paid to farmers</div>
                <div className="v">{fmtUsdc(totalPaid)}<span className="kpi-unit">USDC</span></div>
                <div className="kpi-sub">{payouts.length} payout{payouts.length !== 1 ? "s" : ""} on-chain</div>
              </div>
              <div className="card stat">
                <div className="k">Origin coverage</div>
                <div className="v">{coverage}<span className="kpi-unit">%</span></div>
                <div className="kpi-sub">{geo} of {farmers.length} farms geolocated · EUDR</div>
              </div>
              <AnchorCard anchor={anchor} />
            </div>

            <div className="section">
              <div className="dash-section-head">
                <h2 style={{ flex: 1, margin: 0 }}>Recent payouts</h2>
                {payouts.length > 6 && <span className="muted" style={{ fontSize: 13 }}>showing 6 of {payouts.length}</span>}
              </div>
              <div className="card">
                {payouts.length === 0 && <div className="pad muted">No payments yet. Verify an arrival or a lot to pay farmers.</div>}
                {payouts.slice(0, 6).map((p, i) => (
                  <div className="payout-row" key={i}>
                    <div className="payout-main">
                      <div className="payout-label">{p.label}</div>
                      <div className="payout-sub">{p.sub}</div>
                    </div>
                    <div className="payout-amt">+{fmtUsdc(p.amount)} USDC</div>
                    {p.explorer
                      ? <a className="link payout-link" href={p.explorer} target="_blank" rel="noreferrer">on-chain ↗</a>
                      : <span className="payout-link muted" style={{ fontSize: 12, textAlign: "right" }}>—</span>}
                  </div>
                ))}
              </div>
            </div>

            {panel === "fund" && (
              <FundPool address={op.poolPublicKey} explorer={op.poolExplorer} busy={busy === "fund"}
                onMint={(amt) => run("fund", () => api.fundPool(amt), () => `Minted ${fmtUsdc(amt)} USDC into the pool.`).then(() => setPanel(null))}
                onClose={() => setPanel(null)} />
            )}
          </>
        )}

        {tab === "Arrivals" && <Arrivals rules={rules} onChanged={load} onNotice={(m) => setNotice({ ok: true, msg: m })} />}

        {tab === "Approvals" && (
          <>
            {todo === 0 && (
              <div className="section">
                <h2>Approvals</h2>
                <div className="card pad muted">All caught up. No farmer accounts or location changes are waiting.</div>
              </div>
            )}
            {pending.length > 0 && (
              <div className="section">
                <h2>New farmer accounts ({pending.length})</h2>
                <p className="sub" style={{ marginTop: -4 }}>Self-registered farmers waiting to be activated before they can be paid.</p>
                <div className="card">
                  {pending.map((f) => (
                    <div className="lot" key={f.id} style={{ borderBottom: "1px solid var(--green-tint)" }}>
                      <div>
                        <div className="code">{f.name}</div>
                        <div className="detail">{f.phone} · {f.village || "—"} · self-registered</div>
                      </div>
                      <div className="spacer" />
                      <span className="pill pill-pending">pending</span>
                      <button className="btn-primary" disabled={busy === f.id}
                        onClick={() => run(f.id, () => api.approveFarmer(f.id), () => `${f.name} approved.`)}>
                        {busy === f.id ? "…" : "Approve"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {locReqs.length > 0 && (
              <div className="section">
                <h2>Location changes ({locReqs.length})</h2>
                <p className="sub" style={{ marginTop: -4 }}>
                  A farmer proposed a farm pin. Approve to make it the trace-grade origin used in EUDR exports.
                </p>
                <div className="card">
                  {locReqs.map((f) => (
                    <div className="lot" key={f.id} style={{ borderBottom: "1px solid var(--green-tint)" }}>
                      <div>
                        <div className="code">{f.name}</div>
                        <div className="detail">
                          {f.village || "—"} · proposed 📍 {f.pendingLat.toFixed(4)}, {f.pendingLng.toFixed(4)}
                          {f.lat != null ? " · updates current pin" : " · first location"}
                        </div>
                      </div>
                      <div className="spacer" />
                      <a className="link" target="_blank" rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${f.pendingLat}&mlon=${f.pendingLng}#map=15/${f.pendingLat}/${f.pendingLng}`}>
                        preview ↗
                      </a>
                      <button className="btn-ghost" disabled={busy === f.id}
                        onClick={() => run(f.id, () => api.rejectLocation(f.id), () => `${f.name}'s location change rejected.`)}>
                        Reject
                      </button>
                      <button className="btn-primary" disabled={busy === f.id}
                        onClick={() => run(f.id, () => api.approveLocation(f.id), () => `${f.name}'s location approved.`)}>
                        {busy === f.id ? "…" : "Approve"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "Trace" && <Trace farmers={farmers} disbursements={disbs} />}

        {tab === "Farmers" && (
          <>
            {pending.length > 0 && (
              <div className="notice notice-ok" style={{ marginBottom: 14 }}>
                {pending.length} farmer {pending.length === 1 ? "account is" : "accounts are"} waiting to be approved in the{" "}
                <button className="link" onClick={() => setTab("Approvals")}>Approvals</button> tab.
              </div>
            )}
            <div className="section">
              <div style={{ display: "flex", alignItems: "center" }}>
                <h2 style={{ flex: 1 }}>Farmer roster ({active.length})</h2>
                <button className="btn-ghost" onClick={() => setPanel(panel === "farmer" ? null : "farmer")}>+ Add farmer</button>
              </div>
              {panel === "farmer" && (
                <NewFarmerForm busy={busy === "farmer"}
                  onSubmit={(body: any) => run("farmer", () => api.addFarmer(body), () => `Added ${body.name} (wallet provisioned).`).then(() => setPanel(null))} />
              )}
              <FarmerTable rows={active} />
            </div>
          </>
        )}

        {tab === "Rules" && (
          <div className="section">
            <div style={{ display: "flex", alignItems: "center" }}>
              <h2 style={{ flex: 1 }}>Payout rules</h2>
              <button className="btn-ghost" onClick={() => setPanel(panel === "rule" ? null : "rule")}>+ New rule</button>
            </div>
            {panel === "rule" && (
              <NewRuleForm busy={busy === "rule"}
                onSubmit={(body: any) => run("rule", () => api.createRule(body), () => "Rule created.").then(() => setPanel(null))} />
            )}
            <RulesTable rows={rules} />
          </div>
        )}
      </div>
    </div>
  );
}

function AnchorCard({ anchor }: { anchor: any }) {
  return (
    <div className="card stat">
      <div className="k">Anchor (cash-out)</div>
      {!anchor ? <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>checking…</div> : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span className={`pill ${anchor.reachable ? "pill-success" : "pill-failed"}`}>{anchor.reachable ? "live" : "offline"}</span>
            <span className="mono" style={{ fontSize: 12.5 }}>{anchor.homeDomain}</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>{(anchor.seps || []).join(" · ")}</div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

// Client-side pager. Data is already loaded; this keeps large rosters/rule sets
// from rendering hundreds of rows at once. (Server-side limit/offset is the next
// step if a single co-op ever has thousands of farmers.)
function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="pager">
      <span className="muted">{from}–{to} of {total}</span>
      <div className="pager-ctrl">
        <button className="btn-ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>Prev</button>
        <span className="pager-page">Page {page + 1} / {pages}</span>
        <button className="btn-ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function usePage(total: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  return { p, pages, from: p * PAGE_SIZE, to: p * PAGE_SIZE + PAGE_SIZE, setPage };
}

function FarmerTable({ rows }: { rows: any[] }) {
  const { p, pages, from, to, setPage } = usePage(rows.length);
  return (
    <>
      <div className="card pad">
        <table>
          <thead><tr><th>Farmer</th><th>Village</th><th className="num">Wallet balance</th><th className="num">Total received</th></tr></thead>
          <tbody>
            {rows.slice(from, to).map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td className="muted">{f.village}</td>
                <td className="num">{fmtUsdc(f.balance)} USDC</td>
                <td className="num">{fmtUsdc(f.totalReceived)} USDC</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: "6px 0" }}>No active farmers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={p} pages={pages} total={rows.length} onPage={setPage} />
    </>
  );
}

function RulesTable({ rows }: { rows: any[] }) {
  const { p, pages, from, to, setPage } = usePage(rows.length);
  return (
    <>
      <div className="card pad">
        <table>
          <thead><tr><th>Rule</th><th>Commodity</th><th>On event</th><th className="num">Rate / kg</th></tr></thead>
          <tbody>
            {rows.slice(from, to).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><span className={`pill commodity-${r.commodity}`}>{r.commodity}</span></td>
                <td className="muted mono">{r.eventType}</td>
                <td className="num">{r.ratePerKg} USDC</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: "6px 0" }}>No rules yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={p} pages={pages} total={rows.length} onPage={setPage} />
    </>
  );
}

function NewRuleForm({ busy, onSubmit }: any) {
  const [name, setName] = useState("");
  const [commodity, setCommodity] = useState("coffee");
  const [ratePerKg, setRate] = useState("0.5");
  return (
    <div className="card pad form-panel">
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Rule name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coffee verified payout" /></div>
        <div className="field"><label>Commodity</label><input value={commodity} onChange={(e) => setCommodity(e.target.value)} /></div>
        <div className="field"><label>USDC / kg</label><input type="number" value={ratePerKg} onChange={(e) => setRate(e.target.value)} /></div>
      </div>
      <button className="btn-green" disabled={busy || !name || !Number(ratePerKg)}
        onClick={() => onSubmit({ name, commodity, ratePerKg: Number(ratePerKg), eventType: "lot.verified" })}>
        {busy ? "Creating…" : "Create rule"}
      </button>
    </div>
  );
}

function NewFarmerForm({ busy, onSubmit }: any) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [village, setVillage] = useState("");
  return (
    <div className="card pad form-panel">
      <div className="row">
        <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901 234 567" /></div>
        <div className="field"><label>Village</label><input value={village} onChange={(e) => setVillage(e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Provisions a custodial Stellar wallet on testnet (~5s). Active immediately — the farmer signs in with this phone number (any format) and a one-time code; no separate sign-up.</div>
      <button className="btn-green" disabled={busy || !name || !phone} onClick={() => onSubmit({ name, phone, village })}>{busy ? "Provisioning…" : "Add farmer"}</button>
    </div>
  );
}
