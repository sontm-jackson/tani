import { useState } from "react";
import { api } from "@shared/api";
import { Select } from "./Select";

const BANKS = ["Vietcombank", "Techcombank", "BIDV", "VietinBank", "Agribank", "MB Bank", "ACB"];
const WALLETS = ["MoMo", "ZaloPay", "Viettel Money"];

export function PayoutCard({ farmer, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const p = farmer.payout;

  return (
    <>
      {p ? (
        <div className="card pad payout-summary">
          <div style={{ flex: 1 }}>
            <div className="payout-provider">{p.provider} ••••{(p.account || "").slice(-4)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {p.type === "bank" ? "Bank account" : "Mobile money"} · {p.name}
            </div>
          </div>
          <button className="btn-ghost" onClick={() => setOpen(true)}>Change</button>
        </div>
      ) : (
        <button className="payout-empty" onClick={() => setOpen(true)}>+ Add a payout destination</button>
      )}
      {open && (
        <PayoutModal farmer={farmer} onClose={() => setOpen(false)}
          onSaved={(f: any) => { onSaved(f); setOpen(false); }} />
      )}
    </>
  );
}

function PayoutModal({ farmer, onClose, onSaved }: any) {
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
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const providers = type === "bank" ? BANKS : WALLETS;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Payout destination</div>
        <h2 style={{ margin: "2px 0 16px" }}>Where should we send your cash?</h2>

        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={type === "momo" ? "on" : ""} onClick={() => pickType("momo")}>Mobile money</button>
          <button className={type === "bank" ? "on" : ""} onClick={() => pickType("bank")}>Bank account</button>
        </div>

        <div className="field">
          <label>{type === "bank" ? "Bank" : "Wallet"}</label>
          <Select value={provider} onChange={setProvider} options={providers} />
        </div>
        <div className="field">
          <label>{type === "bank" ? "Account number" : "Phone number"}</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={type === "bank" ? "0123456789" : "0901234567"} />
        </div>
        <div className="field">
          <label>Account holder name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {err && <div className="notice notice-err">{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button className="btn-green" style={{ flex: 2 }} disabled={busy || !account || !name} onClick={save}>
            {busy ? "Saving…" : "Save destination"}
          </button>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
