import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { api, fmtUsdc } from "@shared/api";

const FIELDS = [
  { key: "variety", label: "Variety" },
  { key: "grade", label: "Grade" },
  { key: "processing", label: "Processing" },
  { key: "moisture", label: "Moisture", suffix: "%" },
  { key: "certification", label: "Certification" },
  { key: "harvestDate", label: "Harvest" },
];

export function Arrivals({ rules, onChanged, onNotice }: { rules: any[]; onChanged: () => void; onNotice: (m: string) => void }) {
  const [ships, setShips] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [code, setCode] = useState("");
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState("");

  function rateFor(commodity: string) {
    return rules.find((r) => r.commodity === commodity && r.active !== false)?.ratePerKg ?? 0.5;
  }

  async function load() {
    setShips(await api.shipments("declared"));
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function open(token: string) {
    setErr("");
    try {
      const s = await api.shipmentByToken(token.trim());
      if (s.status !== "declared") setErr(`This delivery is already ${s.status}.`);
      else { setSel(s); setCam(false); setCode(""); }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="section">
      <h2>Arrivals — scan &amp; pay</h2>
      <p className="sub" style={{ marginTop: -6 }}>
        Farmers declare deliveries in the app. Scan the QR on the farmer's phone, weigh the goods, and pay on the spot.
      </p>

      <div className="card pad arr-scan">
        {cam ? (
          <>
            <CameraScan onScan={(t) => open(t)} />
            <button className="btn-ghost block" style={{ marginTop: 12 }} onClick={() => setCam(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn-green arr-scan-btn" onClick={() => { setErr(""); setCam(true); }}>
              <ScanIcon /> Scan farmer's QR
            </button>
            <div className="arr-paste">
              <input placeholder="or paste a code (TANI-…)" value={code}
                onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && open(code)} />
              <button className="btn-ghost" disabled={!code} onClick={() => open(code)}>Look up</button>
            </div>
          </>
        )}
        {err && <div className="notice notice-err">{err}</div>}
      </div>

      <div className="arr-expected-head">
        <h3>Expected today</h3>
        <span className="arr-count">{ships.length}</span>
      </div>
      <div className="card">
        {ships.length === 0 && <div className="pad muted">No deliveries awaiting arrival.</div>}
        {ships.map((s) => (
          <button className="arr-row" key={s.id} onClick={() => setSel(s)}>
            <div className="arr-row-main">
              <div className="arr-row-name">{s.farmerName}</div>
              <div className="arr-row-detail">{s.variety} · {s.claimedKg}kg · {s.certification}</div>
            </div>
            <span className="pill pill-pending">declared</span>
            <span className="arr-chev">›</span>
          </button>
        ))}
      </div>

      {sel && (
        <VerifyPanel shipment={sel} rate={rateFor(sel.commodity ?? "coffee")} onClose={() => setSel(null)}
          onDone={async (msg: string) => { setSel(null); await load(); onChanged(); onNotice(msg); }} />
      )}
    </div>
  );
}

function CameraScan({ onScan }: { onScan: (t: string) => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 240 }, false);
    scanner.render((text) => { scanner.clear().catch(() => {}); onScan(text); }, () => {});
    return () => { scanner.clear().catch(() => {}); };
  }, []);
  return <div id="qr-reader" />;
}

function VerifyPanel({ shipment, rate, onClose, onDone }: any) {
  const [verifiedKg, setKg] = useState(String(shipment.claimedKg));
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [showFlags, setShowFlags] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const kg = Number(verifiedKg) || 0;
  const amount = Math.round(kg * rate * 1e7) / 1e7;
  const weightChanged = Number(verifiedKg) !== shipment.claimedKg;

  function toggle(k: string) {
    const n = new Set(flags);
    n.has(k) ? n.delete(k) : n.add(k);
    setFlags(n);
  }

  async function submit(accept: boolean) {
    setBusy(accept ? "pay" : "reject");
    setErr("");
    try {
      const discrepancies = [...flags];
      if (accept && kg !== shipment.claimedKg) discrepancies.push(`weight ${shipment.claimedKg}→${kg}kg`);
      const r = await api.verifyShipment(shipment.id, { verifiedKg: kg, discrepancies, note, accept });
      onDone(accept ? `Verified & paid ${fmtUsdc(r.amountPaid)} USDC to ${shipment.farmerName}.` : `Delivery from ${shipment.farmerName} rejected.`);
    } catch (e: any) {
      setErr(e.message);
      setBusy("");
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Verify arrival</div>
        <h2 style={{ margin: "2px 0 2px" }}>{shipment.farmerName}</h2>
        <p className="sub" style={{ marginBottom: 18 }}>
          {shipment.village} · <span className="mono">{shipment.qrToken}</span>
          <button className="copy-token" onClick={() => { navigator.clipboard?.writeText(shipment.qrToken); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </p>

        {/* weight is the number that matters — lead with it, show the payout live */}
        <div className="vp-weight">
          <label>Weight on the scale</label>
          <div className="vp-weight-row">
            <input type="number" inputMode="decimal" value={verifiedKg} onChange={(e) => setKg(e.target.value)} />
            <span className="vp-unit">kg</span>
            <span className="vp-claim">declared {shipment.claimedKg}</span>
          </div>
          <div className="vp-pay-preview">Pay <b>{fmtUsdc(amount)} USDC</b>{weightChanged ? ` on ${kg}kg verified` : ""}</div>
        </div>

        {/* declared quality — everything's fine by default, tap only to flag a problem */}
        <div className="vp-declared">
          <div className="vp-declared-head">
            <span>Declared quality</span>
            <button className="link" onClick={() => setShowFlags((v) => !v)}>{showFlags ? "done" : "flag a problem"}</button>
          </div>
          <div className="vp-chips">
            {FIELDS.map((f) => shipment[f.key] != null && (
              showFlags ? (
                <button key={f.key} className={flags.has(f.key) ? "vp-chip flagged" : "vp-chip"} onClick={() => toggle(f.key)}>
                  {String(shipment[f.key])}{f.suffix ?? ""}{flags.has(f.key) ? " ✕" : ""}
                </button>
              ) : (
                <span key={f.key} className="vp-chip">{String(shipment[f.key])}{f.suffix ?? ""}</span>
              )
            ))}
          </div>
          {flags.size > 0 && (
            <input className="vp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. moisture high, accepted on adjusted weight)" />
          )}
        </div>

        {err && <div className="notice notice-err">{err}</div>}

        <div className="vp-actions">
          <button className="btn-primary" disabled={!!busy || !kg} onClick={() => submit(true)}>
            {busy === "pay" ? "Paying…" : `Verify & pay ${fmtUsdc(amount)} USDC`}
          </button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => submit(false)}>{busy === "reject" ? "…" : "Reject"}</button>
        </div>
      </div>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-4px", marginRight: 8 }}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
