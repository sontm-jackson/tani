import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { api, fmtUsdc } from "@shared/api";

const FIELDS = [
  { key: "variety", label: "Variety" },
  { key: "grade", label: "Grade" },
  { key: "processing", label: "Processing" },
  { key: "moisture", label: "Moisture", suffix: "%" },
  { key: "certification", label: "Certification" },
  { key: "harvestDate", label: "Harvest date" },
];

export function Arrivals({ onChanged, onNotice }: { onChanged: () => void; onNotice: (m: string) => void }) {
  const [ships, setShips] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [code, setCode] = useState("");
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState("");

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
      if (s.status !== "declared") setErr(`Shipment already ${s.status}.`);
      else setSel(s);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="section">
      <h2>Arrivals — scan to verify &amp; pay</h2>
      <p className="sub" style={{ marginTop: -6 }}>
        Farmers declared these shipments and shipped them with a QR. Scan on arrival, check the
        package against the declaration, then pay on the verified weight.
      </p>

      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <input placeholder="Scan or paste QR code (e.g. TANI-…)" value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && open(code)} style={{ flex: 2 }} />
          <button className="btn-green" style={{ minWidth: 120 }} disabled={!code} onClick={() => open(code)}>Look up</button>
          <button className="btn-ghost" onClick={() => setCam((v) => !v)}>{cam ? "Close camera" : "Scan with camera"}</button>
        </div>
        {cam && <CameraScan onScan={(t) => { setCam(false); setCode(t); open(t); }} />}
        {err && <div className="notice notice-err">{err}</div>}
      </div>

      <div className="card">
        {ships.length === 0 && <div className="pad muted">No shipments awaiting arrival.</div>}
        {ships.map((s) => (
          <div className="lot" key={s.id} style={{ borderBottom: "1px solid var(--green-tint)" }}>
            <div>
              <div className="code">{s.farmerName} <span className="mono muted" style={{ fontSize: 12.5, marginLeft: 6 }}>{s.qrToken}</span></div>
              <div className="detail">{s.variety} · {s.claimedKg}kg claimed · {s.certification}</div>
            </div>
            <div className="spacer" />
            <span className="pill pill-pending">in transit</span>
            <button className="btn-primary" onClick={() => setSel(s)}>Scan / verify</button>
          </div>
        ))}
      </div>

      {sel && (
        <VerifyPanel shipment={sel} onClose={() => setSel(null)}
          onDone={async (msg: string) => { setSel(null); await load(); onChanged(); onNotice(msg); }} />
      )}
    </div>
  );
}

function CameraScan({ onScan }: { onScan: (t: string) => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 220 }, false);
    scanner.render((text) => { scanner.clear().catch(() => {}); onScan(text); }, () => {});
    return () => { scanner.clear().catch(() => {}); };
  }, []);
  return <div id="qr-reader" style={{ marginTop: 12, maxWidth: 360 }} />;
}

function VerifyPanel({ shipment, onClose, onDone }: any) {
  const [verifiedKg, setKg] = useState(String(shipment.claimedKg));
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

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
      const kg = Number(verifiedKg);
      if (accept && kg !== shipment.claimedKg) discrepancies.push(`weight ${shipment.claimedKg}→${kg}kg`);
      const r = await api.verifyShipment(shipment.id, { verifiedKg: kg, discrepancies, note, accept });
      onDone(accept ? `Verified & paid ${fmtUsdc(r.amountPaid)} USDC to ${shipment.farmerName}.` : `Shipment from ${shipment.farmerName} rejected.`);
    } catch (e: any) {
      setErr(e.message);
      setBusy("");
    }
  }

  const weightChanged = Number(verifiedKg) !== shipment.claimedKg;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Verify arrival</div>
        <h2 style={{ margin: "2px 0 2px" }}>{shipment.farmerName}</h2>
        <p className="sub" style={{ marginBottom: 16 }}>{shipment.village} · {shipment.qrToken}</p>

        <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
          Check the package against the declaration — flag anything that doesn't match.
        </div>

        {/* weight, editable */}
        <div className="verify-row">
          <div>
            <div className="vf-label">Weight</div>
            <div className="vf-claim">declared {shipment.claimedKg}kg</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" value={verifiedKg} onChange={(e) => setKg(e.target.value)} style={{ width: 100 }} />
            <span className="muted">kg verified</span>
          </div>
        </div>
        {weightChanged && <div className="vf-adjust">adjusted from {shipment.claimedKg}kg — paid on {verifiedKg}kg</div>}

        {/* other declared fields, flag if mismatch */}
        {FIELDS.map((f) => shipment[f.key] != null && (
          <div className="verify-row" key={f.key}>
            <div>
              <div className="vf-label">{f.label}</div>
              <div className="vf-claim">{String(shipment[f.key])}{f.suffix ?? ""}</div>
            </div>
            <button className={flags.has(f.key) ? "btn-flag on" : "btn-flag"} onClick={() => toggle(f.key)}>
              {flags.has(f.key) ? "✕ mismatch" : "✓ matches"}
            </button>
          </div>
        ))}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. moisture slightly high, accepted" />
        </div>

        {err && <div className="notice notice-err">{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn-primary" style={{ flex: 2 }} disabled={!!busy} onClick={() => submit(true)}>
            {busy === "pay" ? "Paying…" : `Verify & pay (on ${verifiedKg}kg)`}
          </button>
          <button className="btn-ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => submit(false)}>
            {busy === "reject" ? "…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
