import { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { api, fmtUsdc, fmtVnd } from "@shared/api";
import { firebaseEnabled, auth } from "./firebase";
import { FarmerShipments } from "./FarmerShipments";
import { PayoutCard } from "./PayoutCard";
import { IconHome, IconShip, IconWallet } from "./icons";

const RATE = 25400;

function totalReceived(f: any): number {
  return (f?.payments ?? []).reduce((s: number, p: any) => s + p.amount, 0);
}

// User types just their local number; we normalize to +84 E.164 (drop leading 0).
function toE164(local: string): string {
  return "+84" + local.replace(/\D/g, "").replace(/^0+/, "");
}
function fmtPhone(e164: string): string {
  return e164.replace(/^\+84(\d{3})(\d{3})(\d+)$/, "+84 $1 $2 $3");
}

export default function Farmer() {
  const [booting, setBooting] = useState(true);
  const [farmer, setFarmer] = useState<any>(null);
  const [tab, setTab] = useState<"home" | "ship" | "wallet">("home");
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const prevReceived = useRef<number | null>(null);

  // login state
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  function applyFarmer(f: any) {
    prevReceived.current = totalReceived(f);
    setFarmer(f);
    setTab("home");
  }

  // auto-login from a saved session
  useEffect(() => {
    if (!api.hasToken()) { setBooting(false); return; }
    api.me().then(applyFarmer).catch(() => api.clearToken()).finally(() => setBooting(false));
  }, []);

  async function sendCode() {
    const e164 = toE164(phone);
    if (e164.length < 11) { setErr("Enter a valid phone number."); return; }
    setBusy(true); setErr("");
    try {
      if (firebaseEnabled && auth) {
        // Use a fresh invisible reCAPTCHA each attempt (reusing a consumed one hangs / errors).
        if (recaptchaRef.current) {
          try { recaptchaRef.current.clear(); } catch {}
          recaptchaRef.current = null;
        }
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
        confirmationRef.current = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
      } else {
        const r = await api.requestOtp(e164);
        setDevCode(r.devCode ?? null);
      }
      setStep("otp");
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!code.trim()) return;
    setBusy(true); setErr("");
    try {
      let token: string;
      if (firebaseEnabled && confirmationRef.current) {
        const cred = await confirmationRef.current.confirm(code.trim());
        const idToken = await cred.user.getIdToken();
        token = (await api.firebaseLogin(idToken)).token;
      } else {
        token = (await api.verifyOtp(toE164(phone), code.trim())).token;
      }
      api.setToken(token);
      applyFarmer(await api.me());
      setStep("phone"); setCode(""); setDevCode(null);
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  function signOut() {
    api.clearToken();
    setFarmer(null);
    prevReceived.current = null;
    setStep("phone"); setPhone(""); setCode("");
  }

  async function refresh() {
    if (!farmer) return;
    const f = await api.me();
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

  if (booting) {
    return <div className="mobile"><div className="spin">Loading…</div></div>;
  }

  // ---- sign in (phone OTP) ----
  if (!farmer) {
    const e164 = toE164(phone);
    return (
      <div className="mobile">
        <div className="signin">
          <img src="/icon-192.png" width={68} height={68} style={{ borderRadius: 18 }} alt="Tani" />
          <h1>Tani</h1>
          {step === "phone" ? (
            <>
              <p className="signin-sub">Sign in with your phone number</p>
              <div className="phone-field">
                <span className="phone-prefix">+84</span>
                <input className="phone-input" type="tel" inputMode="numeric" autoFocus maxLength={10}
                  placeholder="912 345 678" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
                  onKeyDown={(e) => e.key === "Enter" && sendCode()} />
              </div>
              <button className="btn-green block" onClick={sendCode} disabled={busy || e164.length < 11}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </>
          ) : (
            <>
              <p className="signin-sub">Code sent to <b>{fmtPhone(e164)}</b></p>
              <input className="otp-input" type="tel" inputMode="numeric" maxLength={6} autoFocus
                placeholder="······" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && verify()} />
              <button className="btn-green block" onClick={verify} disabled={busy || code.length < 6}>
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button className="link signin-link" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>
                Change number
              </button>
              {devCode && <div className="signin-msg ok">Test code: <b>{devCode}</b></div>}
            </>
          )}
          {err && <div className="signin-msg err">{err}</div>}
          <div id="recaptcha-container" />
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
        <button onClick={signOut}>Sign out</button>
      </div>

      <div className="appbody">
        {tab === "home" && <Home farmer={farmer} justPaid={justPaid} goWallet={() => setTab("wallet")} />}
        {tab === "ship" && <FarmerShipments />}
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
      const r = await api.meCashout(amt);
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
