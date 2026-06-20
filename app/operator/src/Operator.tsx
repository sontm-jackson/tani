import { useEffect, useState } from "react";
import { api, fmtUsdc } from "@shared/api";
import { Arrivals } from "./Arrivals";
import { Trace } from "./Trace";

// Arrivals is the daily workspace (scan -> verify -> pay), so it leads and is the
// default. The batch "Lots" path is hidden from the UI to keep one clear payment
// spine; the lot engine still exists in the API.
const TABS = ["Arrivals", "Approvals", "Dashboard", "Farmers", "Trace", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function Operator({ onLogout }: { onLogout: () => void }) {
  const [op, setOp] = useState<any>(null);
  const [disbs, setDisbs] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Arrivals");

  async function load() {
    const [o, d, f, r] = await Promise.all([
      api.operator(), api.disbursements(), api.farmers(), api.rules(),
    ]);
    setOp(o); setDisbs(d); setFarmers(f); setRules(r);
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
            <div className="row">
              <div className="card hero" style={{ flex: 2 }}>
                <div>
                  <div className="eyebrow">Payout pool</div>
                  <div className="balance">{fmtUsdc(op.poolBalance)}<span>USDC</span></div>
                  <div className="meta"><a className="link" href={op.poolExplorer} target="_blank" rel="noreferrer">view pool account on-chain ↗</a></div>
                </div>
                <div className="spacer" />
                <FundBox busy={busy === "fund"} onFund={(amt) => run("fund", () => api.fundPool(amt), () => `Minted ${amt} USDC into the pool.`)} />
              </div>
              <div className="card stat"><div className="k">Farmers</div><div className="v">{op.counts.farmers}</div></div>
              <div className="card stat"><div className="k">Disbursements</div><div className="v">{op.counts.disbursements}</div></div>
              <AnchorCard anchor={anchor} />
            </div>
            <div className="section">
              <h2>Recent disbursements</h2>
              <div className="card">
                {disbs.length === 0 && <div className="pad muted">Nothing disbursed yet.</div>}
                {disbs.slice(0, 4).map((d) => (
                  <div className="disb" key={d.id}>
                    <div className="head">
                      <span className={`pill pill-${d.status}`}>{d.status}</span>
                      <b>{d.lot}</b>
                      <span className="muted" style={{ fontSize: 13 }}>{d.payments.length} farmers</span>
                      <span className="amount">{fmtUsdc(d.totalAmount)} USDC</span>
                    </div>
                    {d.explorer && <a className="link" href={d.explorer} target="_blank" rel="noreferrer">transaction on-chain ↗</a>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "Arrivals" && <Arrivals onChanged={load} onNotice={(m) => setNotice({ ok: true, msg: m })} />}

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
              <div className="card pad">
                <table>
                  <thead><tr><th>Farmer</th><th>Village</th><th className="num">Wallet balance</th><th className="num">Total received</th></tr></thead>
                  <tbody>
                    {active.map((f) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td className="muted">{f.village}</td>
                        <td className="num">{fmtUsdc(f.balance)} USDC</td>
                        <td className="num">{fmtUsdc(f.totalReceived)} USDC</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <div className="card pad">
              <table>
                <thead><tr><th>Rule</th><th>Commodity</th><th>On event</th><th className="num">Rate / kg</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td><span className={`pill commodity-${r.commodity}`}>{r.commodity}</span></td>
                      <td className="muted mono">{r.eventType}</td>
                      <td className="num">{r.ratePerKg} USDC</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FundBox({ busy, onFund }: { busy: boolean; onFund: (n: number) => void }) {
  const [amt, setAmt] = useState("2000");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input style={{ width: 110 }} value={amt} onChange={(e) => setAmt(e.target.value)} type="number" />
      <button className="btn-ghost" disabled={busy || !Number(amt)} onClick={() => onFund(Number(amt))}>{busy ? "Funding…" : "Fund pool"}</button>
    </div>
  );
}

function AnchorCard({ anchor }: { anchor: any }) {
  return (
    <div className="card stat" style={{ minWidth: 230 }}>
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
        <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8490..." /></div>
        <div className="field"><label>Village</label><input value={village} onChange={(e) => setVillage(e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Provisions a custodial Stellar wallet on testnet (~5s). Added farmers are active immediately.</div>
      <button className="btn-green" disabled={busy || !name || !phone} onClick={() => onSubmit({ name, phone, village })}>{busy ? "Provisioning…" : "Add farmer"}</button>
    </div>
  );
}
