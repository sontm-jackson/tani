import { useEffect, useRef, useState } from "react";
import { api, fmtUsdc, fmtVnd } from "@shared/api";
import { FarmerShipments } from "./FarmerShipments";
import { PayoutCard } from "./PayoutCard";
import { IconHome, IconShip, IconWallet } from "./icons";

const DEMO_PHONES = ["+84901000001", "+84901000003", "+84901000007"];
const RATE = 25400;

function totalReceived(f: any): number {
  return (f?.payments ?? []).reduce((s: number, p: any) => s + p.amount, 0);
}

export default function Farmer() {
  const [phone, setPhone] = useState("");
  const [farmer, setFarmer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState<"home" | "ship" | "wallet">("home");
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const prevReceived = useRef<number | null>(null);

  async function login(p?: string) {
    const ph = (p ?? phone).trim();
    if (!ph) return;
    setBusy(true);
    setLoginErr("");
    try {
      const f = await api.farmerByPhone(ph);
      prevReceived.current = totalReceived(f);
      setFarmer(f);
      setPhone(ph);
      setTab("home");
    } catch (e: any) {
      setLoginErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!farmer) return;
    const f = await api.farmer(farmer.id);
    const t = totalReceived(f);
    if (prevReceived.current != null && t > prevReceived.current + 1e-9) {
      setJustPaid(t - prevReceived.current);
      window.setTimeout(() => setJustPaid(null), 9000);
    }
    prevReceived.current = t;
    setFarmer(f);
  }

  useEffect(() => {
    if (!farmer?.id) return;
    const id = window.setInterval(() => refresh().catch(() => {}), 4000);
    return () => window.clearInterval(id);
  }, [farmer?.id]);

  // ---- sign in ----
  if (!farmer) {
    return (
      <div className="mobile">
        <div className="signin">
          <img src="/icon-192.png" width={72} height={72} style={{ borderRadius: 18 }} alt="Tani" />
          <h1>Tani</h1>
          <p className="muted">Get paid the moment your delivery is verified.</p>
          <div className="field" style={{ width: "100%", marginTop: 18 }}>
            <input placeholder="Phone number" value={phone}
              onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          </div>
          <button className="btn-green block" onClick={() => login()} disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
          {loginErr && <div className="notice notice-err" style={{ width: "100%" }}>{loginErr}</div>}
          <div className="muted demo-links">
            {DEMO_PHONES.map((p, i) => (
              <span key={p}>{i > 0 && " · "}<a href="#" onClick={(e) => { e.preventDefault(); login(p); }}>{p}</a></span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- app ----
  return (
    <div className="mobile">
      <div className="appbar">
        <span className="brand">Tani<span className="dot">.</span></span>
        <span className="appbar-sub">{farmer.name.split(" ").slice(-1)[0]}</span>
        <span className="spacer" />
        <button onClick={() => { setFarmer(null); prevReceived.current = null; }}>Sign out</button>
      </div>

      <div className="appbody">
        {tab === "home" && <Home farmer={farmer} justPaid={justPaid} goWallet={() => setTab("wallet")} />}
        {tab === "ship" && <FarmerShipments farmerId={farmer.id} />}
        {tab === "wallet" && <Wallet farmer={farmer} onChange={setFarmer} refresh={refresh} />}
      </div>

      <div className="tabbar">
        <button className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}><span className="ic"><IconHome /></span>Home</button>
        <button className={tab === "ship" ? "on" : ""} onClick={() => setTab("ship")}><span className="ic"><IconShip /></span>Ship</button>
        <button className={tab === "wallet" ? "on" : ""} onClick={() => setTab("wallet")}><span className="ic"><IconWallet /></span>Wallet</button>
      </div>
    </div>
  );
}

function Home({ farmer, justPaid, goWallet }: any) {
  const [shown, setShown] = useState(5);
  const activity = [
    ...farmer.payments.map((p: any) => ({ id: p.id, when: p.createdAt, kind: "in", title: p.reason, sub: "received", amt: `+${fmtUsdc(p.amount)} USDC`, link: p.explorer })),
    ...farmer.cashOuts.map((c: any) => ({ id: c.id, when: c.createdAt, kind: "out", title: `Withdraw to ${c.destMasked ?? "destination"}`, sub: c.status, amt: `${fmtVnd(c.amountLocal)} ₫` })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  return (
    <>
      {justPaid != null && <div className="paid-banner">You were just paid <b>+{fmtUsdc(justPaid)} USDC</b></div>}
      <div className="balance-hero">
        <div className="lbl">Your balance</div>
        <div className="big">{fmtUsdc(farmer.balance)}<span>USDC</span></div>
        <button className="btn-amber block" style={{ marginTop: 18 }} onClick={goWallet}>Withdraw to cash</button>
      </div>

      <h2 className="sec-title">Activity</h2>
      <div className="card">
        {activity.length === 0 && <div className="pad muted">No activity yet. Create a shipment from the Ship tab.</div>}
        {activity.slice(0, shown).map((a) => (
          <div className="act" key={a.id}>
            <div className={`act-ic ${a.kind}`}>{a.kind === "in" ? "↓" : "↑"}</div>
            <div className="act-main">
              <div className="act-title">{a.title}</div>
              <div className="act-sub">{a.sub}{a.link && <> · <a className="link" href={a.link} target="_blank" rel="noreferrer">on-chain</a></>}</div>
            </div>
            <div className={`act-amt ${a.kind}`}>{a.amt}</div>
          </div>
        ))}
      </div>
      {activity.length > shown && (
        <button className="btn-ghost block show-more" onClick={() => setShown((n) => n + 5)}>
          Show more ({activity.length - shown})
        </button>
      )}
    </>
  );
}

function Wallet({ farmer, onChange, refresh }: any) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  async function cashOut() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setBusy(true); setNotice(null);
    try {
      const r = await api.cashOut(farmer.id, amt);
      setNotice({ ok: r.status === "success", msg: r.status === "success" ? `${fmtUsdc(r.amountUsdc)} USDC → ${fmtVnd(r.amountLocal)} ₫ sent to ${r.destMasked}` : `Cash-out ${r.status}` });
      setAmount("");
      await refresh();
    } catch (e: any) {
      setNotice({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="balance-mini">
        <span className="muted">Balance</span>
        <b>{fmtUsdc(farmer.balance)} USDC</b>
      </div>

      <h2 className="sec-title">Payout destination</h2>
      <PayoutCard farmer={farmer} onSaved={onChange} />

      <h2 className="sec-title">Withdraw to cash</h2>
      <div className="card pad">
        {!farmer.payout ? (
          <div className="muted" style={{ fontSize: 13.5 }}>Add a payout destination above to withdraw.</div>
        ) : (
          <>
            <div className="row" style={{ gap: 10 }}>
              <input type="number" placeholder="USDC amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 2 }} />
              <button className="btn-amber" style={{ flex: 1, minWidth: 110 }} onClick={cashOut} disabled={busy || !Number(amount)}>{busy ? "…" : "Withdraw"}</button>
            </div>
            {Number(amount) > 0 && (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                ≈ {fmtVnd(Math.round(Number(amount) * RATE))} ₫ to {farmer.payout.provider} ••••{(farmer.payout.account || "").slice(-4)}
              </div>
            )}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Sent via a Stellar anchor. Simulated on testnet — production routes to a licensed Vietnamese anchor.</div>
          </>
        )}
        {notice && <div className={`notice ${notice.ok ? "notice-ok" : "notice-err"}`}>{notice.msg}</div>}
      </div>
    </>
  );
}
