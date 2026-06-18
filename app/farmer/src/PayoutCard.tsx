import { useState } from "react";
import { api } from "@shared/api";
import { Select } from "./Select";

const BANKS = ["Vietcombank", "Techcombank", "BIDV", "VietinBank", "Agribank", "MB Bank", "ACB"];
const WALLETS = ["MoMo", "ZaloPay", "Viettel Money"];

export function PayoutCard({ farmer, onSaved }: any) {
  const [editing, setEditing] = useState(!farmer.payout);
  const [type, setType] = useState(farmer.payout?.type ?? "momo");
  const [provider, setProvider] = useState(farmer.payout?.provider ?? "MoMo");
  const [account, setAccount] = useState(farmer.payout?.account ?? "");
  const [name, setName] = useState(farmer.payout?.name ?? farmer.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pickType(t: string) {
    setType(t);
    setProvider(t === "bank" ? BANKS[0] : WALLETS[0]);
  }

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const f = await api.setPayoutMethod(farmer.id, {
        payoutType: type, payoutProvider: provider, payoutAccount: account, payoutName: name,
      });
      onSaved(f);
      setEditing(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing && farmer.payout) {
    return (
      <div className="card pad" style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            {farmer.payout.provider} ••••{(farmer.payout.account || "").slice(-4)}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {farmer.payout.type === "bank" ? "Bank account" : "Mobile money"} · {farmer.payout.name}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }

  const providers = type === "bank" ? BANKS : WALLETS;
  return (
    <div className="card pad form-panel">
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={type === "momo" ? "on" : ""} onClick={() => pickType("momo")}>Mobile money</button>
        <button className={type === "bank" ? "on" : ""} onClick={() => pickType("bank")}>Bank account</button>
      </div>
      <div className="row">
        <div className="field">
          <label>{type === "bank" ? "Bank" : "Wallet"}</label>
          <Select value={provider} onChange={setProvider} options={providers} />
        </div>
        <div className="field">
          <label>{type === "bank" ? "Account number" : "Phone number"}</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={type === "bank" ? "0123456789" : "0901234567"} />
        </div>
      </div>
      <div className="field">
        <label>Account holder name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {err && <div className="notice notice-err">{err}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-green" disabled={busy || !account || !name} onClick={save}>
          {busy ? "Saving…" : "Save destination"}
        </button>
        {farmer.payout && <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </div>
  );
}
