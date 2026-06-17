import { useEffect, useState } from "react";
import { api, fmtUsdc } from "@shared/api";
import { Qr } from "./Qr";
import { downloadQr, printLabel } from "./qrUtils";

const VARIETIES = ["Arabica Catimor", "Arabica Bourbon", "Robusta"];
const GRADES = ["Specialty / Screen 18", "Grade 1 / Screen 16", "Grade 2 / Screen 13"];
const PROCESSING = ["Washed", "Natural", "Honey"];
const CERTS = ["Organic", "Fairtrade", "Rainforest Alliance", "None"];

type View = "list" | "create" | { detail: any };

function statusPill(s: string) {
  if (s === "paid") return <span className="pill pill-success">Paid</span>;
  if (s === "rejected") return <span className="pill pill-failed">Rejected</span>;
  return <span className="pill pill-pending">In transit</span>;
}

export function FarmerShipments({ farmerId }: { farmerId: string }) {
  const [ships, setShips] = useState<any[]>([]);
  const [view, setView] = useState<View>("list");
  const [shown, setShown] = useState(5);

  async function load() {
    const all = await api.shipments();
    setShips(all.filter((s: any) => s.farmerId === farmerId));
  }
  useEffect(() => {
    load().catch(() => {});
  }, [farmerId]);

  if (view === "create") {
    return <CreateShipment farmerId={farmerId} onCancel={() => setView("list")}
      onCreated={async (s: any) => { await load(); setView({ detail: s }); }} />;
  }
  if (typeof view === "object") {
    return <ShipmentDetail shipment={view.detail} onBack={() => setView("list")} />;
  }

  return (
    <div className="ship-tab">
      <button className="btn-green block create-cta" onClick={() => setView("create")}>+ Create shipment</button>

      <h2 className="sec-title" style={{ marginTop: 22 }}>Your shipments</h2>
      <div className="card">
        {ships.length === 0 && <div className="pad muted">No shipments yet. Create one to get a QR for your bag.</div>}
        {ships.slice(0, shown).map((s) => (
          <button className="ship-item" key={s.id} onClick={() => setView({ detail: s })}>
            <div className="ship-item-main">
              <div className="ship-item-title">{s.variety} · {s.claimedKg}kg</div>
              <div className="ship-item-sub">
                {s.status === "paid" ? `Paid +${fmtUsdc(s.amountPaid)} USDC on verified ${s.verifiedKg}kg` : s.certification}
              </div>
            </div>
            {statusPill(s.status)}
            <span className="chev">›</span>
          </button>
        ))}
      </div>
      {ships.length > shown && (
        <button className="btn-ghost block show-more" onClick={() => setShown((n) => n + 5)}>
          Show more ({ships.length - shown})
        </button>
      )}
    </div>
  );
}

function CreateShipment({ farmerId, onCreated, onCancel }: any) {
  const [variety, setVariety] = useState(VARIETIES[0]);
  const [claimedKg, setKg] = useState("");
  const [grade, setGrade] = useState(GRADES[1]);
  const [processing, setProcessing] = useState(PROCESSING[0]);
  const [moisture, setMoisture] = useState("12.0");
  const [certification, setCert] = useState(CERTS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    try {
      const s = await api.createShipment({
        farmerId, commodity: "coffee", variety, claimedKg: Number(claimedKg),
        grade, processing, moisture: Number(moisture), certification,
        harvestDate: new Date().toISOString().slice(0, 10),
      });
      onCreated(s);
    } catch (e: any) {
      setErr(e.message); setBusy(false);
    }
  }

  return (
    <div className="ship-tab">
      <button className="link back" onClick={onCancel}>← Back</button>
      <h2 className="view-title">Create shipment</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>Declare what's in the bag. You'll get a QR to attach before shipping.</p>

      <div className="form-group">
        <div className="form-group-label">Product</div>
        <div className="field"><label>Variety</label>
          <select value={variety} onChange={(e) => setVariety(e.target.value)}>{VARIETIES.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label>Weight (kg)</label>
          <input type="number" inputMode="decimal" value={claimedKg} onChange={(e) => setKg(e.target.value)} placeholder="240" /></div>
      </div>

      <div className="form-group">
        <div className="form-group-label">Quality</div>
        <div className="field"><label>Grade</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label>Processing</label>
          <select value={processing} onChange={(e) => setProcessing(e.target.value)}>{PROCESSING.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label>Moisture %</label>
          <input type="number" inputMode="decimal" value={moisture} onChange={(e) => setMoisture(e.target.value)} /></div>
        <div className="field"><label>Certification</label>
          <select value={certification} onChange={(e) => setCert(e.target.value)}>{CERTS.map((v) => <option key={v}>{v}</option>)}</select></div>
      </div>

      {err && <div className="notice notice-err">{err}</div>}
      <button className="btn-green block" disabled={busy || !Number(claimedKg)} onClick={submit}>
        {busy ? "Creating…" : "Create & generate QR"}
      </button>
    </div>
  );
}

function ShipmentDetail({ shipment: s, onBack }: any) {
  const inTransit = s.status === "declared";
  return (
    <div className="ship-tab">
      <button className="link back" onClick={onBack}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
        <h2 className="view-title" style={{ margin: 0 }}>Shipment</h2>
        {statusPill(s.status)}
      </div>

      <div className="card detail-qr">
        <Qr value={s.qrToken} size={180} />
        <div className="token">{s.qrToken}</div>
        <div className="qr-actions">
          <button className="btn-ghost" onClick={() => downloadQr(s.qrToken)}>Download QR</button>
          <button className="btn-ghost" onClick={() => printLabel(s)}>Print label</button>
        </div>
        {inTransit
          ? <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>Print this QR and attach it to your bag, then ship it to the cooperative.</div>
          : s.status === "paid"
            ? <div className="notice notice-ok" style={{ margin: 0 }}>Paid +{fmtUsdc(s.amountPaid)} USDC on verified {s.verifiedKg}kg</div>
            : <div className="notice notice-err" style={{ margin: 0 }}>Rejected on inspection{s.note ? `: ${s.note}` : ""}</div>}
      </div>

      <h2 className="sec-title">Declaration</h2>
      <div className="card pad detail-list">
        <Row k="Variety" v={s.variety} />
        <Row k="Weight" v={`${s.claimedKg} kg${s.verifiedKg && s.verifiedKg !== s.claimedKg ? ` (verified ${s.verifiedKg}kg)` : ""}`} />
        <Row k="Grade" v={s.grade} />
        <Row k="Processing" v={s.processing} />
        <Row k="Moisture" v={`${s.moisture}%`} />
        <Row k="Certification" v={s.certification} />
        {s.discrepancies?.length > 0 && <Row k="Adjusted" v={s.discrepancies.join(", ")} />}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  if (v == null || v === "") return null;
  return (
    <div className="detail-row">
      <span className="detail-k">{k}</span>
      <span className="detail-v">{v}</span>
    </div>
  );
}
