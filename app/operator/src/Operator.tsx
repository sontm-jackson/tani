import { useEffect, useState } from "react";
import { api, fmtUsdc } from "@shared/api";
import { Arrivals } from "./Arrivals";

const TABS = ["Dashboard", "Arrivals", "Lots", "Farmers", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function Operator({ onLogout }: { onLogout: () => void }) {
  const [op, setOp] = useState<any>(null);
  const [lots, setLots] = useState<any[]>([]);
  const [disbs, setDisbs] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Dashboard");

  async function load() {
    const [o, l, d, f, r] = await Promise.all([
      api.operator(), api.lots(), api.disbursements(), api.farmers(), api.rules(),
    ]);
    setOp(o); setLots(l); setDisbs(d); setFarmers(f); setRules(r);
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

  return (
    <div className="op-shell">
      <div className="op-bar">
        <div className="wrap op-bar-inner">
          <span className="op-brand">Tani<span className="dot">.</span></span>
          <span className="op-co">{op.name}</span>
          <span className="spacer" />
          <span className="badge">testnet</span>
          <button className="op-signout" onClick={onLogout}>Sign out</button>
        </div>
      </div>
      <div className="op-tabs wrap">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}{t === "Farmers" && pending.length > 0 ? <span className="tab-badge">{pending.length}</span> : null}
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

        {tab === "Lots" && (
          <>
            <div className="section">
              <div style={{ display: "flex", alignItems: "center" }}>
                <h2 style={{ flex: 1 }}>Lots (batch verification)</h2>
                <button className="btn-ghost" onClick={() => setPanel(panel === "lot" ? null : "lot")}>+ New lot</button>
              </div>
              {panel === "lot" && (
                <NewLotForm farmers={active} busy={busy === "lot"}
                  onSubmit={(body: any) => run("lot", () => api.createLot(body), () => "Lot created.").then(() => setPanel(null))} />
              )}
              <div className="card">
                {lots.length === 0 && <div className="pad muted">No lots.</div>}
                {lots.map((l) => (
                  <div className="lot" key={l.id} style={{ borderBottom: "1px solid var(--green-tint)" }}>
                    <div>
                      <div className="code">{l.code} <span className={`pill commodity-${l.commodity}`} style={{ marginLeft: 6 }}>{l.commodity}</span></div>
                      <div className="detail">{l.totalKg}kg · {l.contributions.length} farmers</div>
                    </div>
                    <div className="spacer" />
                    <span className={`pill pill-${l.status}`}>{l.status}</span>
                    {l.status !== "paid" ? (
                      <button className="btn-primary" onClick={() => run(l.id, () => api.verifyLot(l.id),
                        (r) => r.status === "success" ? `Disbursed ${fmtUsdc(r.totalAmount)} USDC to ${r.payments.length} farmers — on-chain.` : `Disbursement ${r.status}`)}
                        disabled={busy === l.id}>
                        {busy === l.id ? "Disbursing…" : "Verify & pay"}
                      </button>
                    ) : <button className="btn-ghost" disabled>Paid</button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="section">
              <h2>Disbursement history</h2>
              <div className="card">
                {disbs.length === 0 && <div className="pad muted">Nothing disbursed yet. Verify a lot above.</div>}
                {disbs.map((d) => (
                  <div className="disb" key={d.id}>
                    <div className="head">
                      <span className={`pill pill-${d.status}`}>{d.status}</span>
                      <b>{d.lot}</b>
                      <span className="muted" style={{ fontSize: 13 }}>{d.payments.length} farmers</span>
                      <span className="amount">{fmtUsdc(d.totalAmount)} USDC</span>
                    </div>
                    {d.explorer && <a className="link" href={d.explorer} target="_blank" rel="noreferrer">transaction on-chain ↗</a>}
                    <div className="payments">
                      {d.payments.map((p: any, i: number) => (<div className="pay" key={i}><span>{p.farmerName}</span><b>{fmtUsdc(p.amount)}</b></div>))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "Farmers" && (
          <>
            {pending.length > 0 && (
              <div className="section">
                <h2>Pending approval ({pending.length})</h2>
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

function NewLotForm({ farmers, busy, onSubmit }: any) {
  const [code, setCode] = useState("");
  const [commodity, setCommodity] = useState("coffee");
  const [rows, setRows] = useState<Record<string, string>>({});
  const contributions = Object.entries(rows).filter(([, v]) => Number(v) > 0).map(([farmerId, v]) => ({ farmerId, quantityKg: Number(v) }));
  return (
    <div className="card pad form-panel">
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Lot code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LOT-2026-002" /></div>
        <div className="field"><label>Commodity</label><input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="coffee" /></div>
      </div>
      <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Contributions (kg)</label>
      <div className="contrib-grid">
        {farmers.map((f: any) => (
          <div key={f.id} className="contrib-row">
            <span>{f.name}</span>
            <input type="number" placeholder="0" value={rows[f.id] ?? ""} onChange={(e) => setRows({ ...rows, [f.id]: e.target.value })} style={{ width: 80 }} />
          </div>
        ))}
      </div>
      <button className="btn-green" style={{ marginTop: 12 }} disabled={busy || !code || contributions.length === 0}
        onClick={() => onSubmit({ code, commodity, contributions })}>
        {busy ? "Creating…" : `Create lot (${contributions.length} farmers)`}
      </button>
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
