import { useState } from "react";
import { api } from "@shared/api";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!email || !password) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.operatorLogin(email.trim(), password);
      api.setToken(r.token);
      onLoggedIn();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="op-login">
      <div className="op-login-card">
        <div className="op-brand" style={{ fontSize: 26 }}>Tani<span className="dot">.</span></div>
        <h1>Cooperative dashboard</h1>
        <p className="muted">Sign in to manage deliveries and payouts.</p>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} autoFocus placeholder="coop@tani.app"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <button className="btn-green block" onClick={submit} disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {err && <div className="notice notice-err">{err}</div>}
        <div className="muted demo-hint">Demo login — coop@tani.app / tani1234</div>
      </div>
    </div>
  );
}
