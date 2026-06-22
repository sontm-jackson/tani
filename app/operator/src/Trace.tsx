import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, fmtUsdc } from "@shared/api";

// Lock the map to inland Vietnam so the contested East Sea / Hoàng Sa / Trường Sa
// area never renders (a sovereignty-safe stopgap until we move to a VN map provider).
// All farms are inland, so this costs nothing. East edge 110°E sits past the
// mainland coast but west of the offshore islands (~111°E+).
const VN_BOUNDS: [[number, number], [number, number]] = [[7.5, 101.5], [23.8, 110.0]];

const pinDim = L.divIcon({ className: "", html: '<div class="farm-pin dim"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
const pinHot = L.divIcon({ className: "", html: '<div class="farm-pin hot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
const pin = L.divIcon({ className: "", html: '<div class="farm-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });

type Result =
  | { kind: "shipment"; s: any }
  | { kind: "lot"; lot: any; disb: any | null }
  | null;

// Pans/zooms the map to the traced origin(s) when a result is selected.
function FitTo({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.flyTo(positions[0], 14, { duration: 0.8 });
    else if (positions.length > 1) map.fitBounds(positions, { padding: [60, 60], maxZoom: 12 });
  }, [JSON.stringify(positions)]);
  return null;
}

export function Trace({ farmers, disbursements }: { farmers: any[]; disbursements: any[] }) {
  const [lots, setLots] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api.lots().then(setLots).catch(() => {}); }, []);

  async function search() {
    const v = q.trim();
    setErr("");
    if (!v) { setResult(null); return; }
    const lot = lots.find((l) => l.code.toLowerCase() === v.toLowerCase())
      ?? lots.find((l) => l.code.toLowerCase().includes(v.toLowerCase()));
    if (lot && (!/^tani-/i.test(v))) {
      const disb = disbursements.find((d) => d.lot === lot.code) ?? null;
      setResult({ kind: "lot", lot, disb });
      return;
    }
    try {
      const s = await api.shipmentByToken(v);
      setResult({ kind: "shipment", s });
    } catch {
      setErr("No shipment (TANI-…) or lot (LOT-…) found for that code.");
      setResult(null);
    }
  }

  // which farms are highlighted, and where to fit the map
  const hotIds = new Set<string>();
  let positions: [number, number][] = [];
  if (result?.kind === "shipment" && result.s.farmerLat != null) {
    hotIds.add(result.s.farmerId);
    positions = [[result.s.farmerLat, result.s.farmerLng]];
  } else if (result?.kind === "lot") {
    for (const c of result.lot.contributions) {
      hotIds.add(c.farmerId);
      if (c.lat != null && c.lng != null) positions.push([c.lat, c.lng]);
    }
  }

  const located = farmers.filter((f) => f.lat != null && f.lng != null);
  const active = result != null;

  return (
    <div className="section">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ flex: 1 }}>Trace</h2>
        <span className="muted" style={{ fontSize: 13 }}>{located.length} farms geolocated</span>
      </div>
      <p className="sub" style={{ marginTop: -4 }}>
        Search a bag's QR code or an export lot to see its exact origin farms on the map, with verified payments proven on-chain.
      </p>

      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <input placeholder="QR code (TANI-…) or lot code (LOT-…)" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} style={{ flex: 2 }} />
          <button className="btn-green" style={{ minWidth: 110 }} onClick={search}>Trace</button>
          {active && <button className="btn-ghost" onClick={() => { setQ(""); setResult(null); setErr(""); }}>Clear</button>}
        </div>
        {err && <div className="notice notice-err" style={{ marginBottom: 0 }}>{err}</div>}
      </div>

      <div className="trace-grid">
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <MapContainer center={[11.85, 108.4]} zoom={9} minZoom={5} maxBounds={VN_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom style={{ height: 520, width: "100%" }}>
            <TileLayer bounds={VN_BOUNDS} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            {located.map((f) => {
              const hot = hotIds.has(f.id);
              return (
                <Marker key={f.id} position={[f.lat, f.lng]} icon={hot ? pinHot : active ? pinDim : pin}>
                  <Popup>
                    <div className="farm-pop">
                      <div className="fp-name">{f.name}</div>
                      <div className="fp-sub">{f.village}{f.yearsFarming ? ` · ${f.yearsFarming} yrs` : ""}</div>
                      {f.bio && <div className="fp-bio">{f.bio}</div>}
                      <div className="fp-stat">Received <b>{fmtUsdc(f.totalReceived)} USDC</b></div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {positions.length > 0 && <FitTo positions={positions} />}
          </MapContainer>
        </div>

        <div className="trace-panel">
          {!result && (
            <div className="card pad muted" style={{ fontSize: 13.5 }}>
              Trace a code to light up its origin. Every farm here is a verified node — a location, a story, and on-chain payments.
            </div>
          )}
          {result?.kind === "shipment" && <ShipmentTrace s={result.s} />}
          {result?.kind === "lot" && <LotTrace lot={result.lot} disb={result.disb} />}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "paid" ? "pill-paid" : status === "rejected" ? "pill-failed" : "pill-pending";
  const label = status === "declared" ? "in transit" : status;
  return <span className={`pill ${cls}`}>{label}</span>;
}

function ShipmentTrace({ s }: { s: any }) {
  const rows: [string, any][] = [
    ["Variety", s.variety], ["Grade", s.grade], ["Processing", s.processing],
    ["Moisture", s.moisture != null ? `${s.moisture}%` : null], ["Certification", s.certification], ["Harvest", s.harvestDate],
  ];
  return (
    <div className="card pad">
      <div className="eyebrow">Bag · {s.qrToken}</div>
      <h3 style={{ margin: "4px 0 2px" }}>{s.farmerName}</h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {s.village}{s.farmerLat != null ? " · origin pinned" : " · location not set"} · <StatusPill status={s.status} />
      </div>
      <div className="trace-rows">
        {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
          <div className="trace-row" key={k}><span>{k}</span><b>{String(v)}</b></div>
        ))}
        {s.status === "paid" && (
          <>
            <div className="trace-row"><span>Verified weight</span><b>{s.verifiedKg}kg</b></div>
            <div className="trace-row"><span>Paid</span><b>{fmtUsdc(s.amountPaid)} USDC</b></div>
          </>
        )}
      </div>
      {s.explorer && <a className="link" href={s.explorer} target="_blank" rel="noreferrer">payment on-chain ↗</a>}
      {s.status !== "paid" && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Not yet verified at arrival.</div>}
    </div>
  );
}

function LotTrace({ lot, disb }: { lot: any; disb: any | null }) {
  const located = lot.contributions.filter((c: any) => c.lat != null).length;
  const payOf = (name: string) => disb?.payments?.find((p: any) => p.farmerName === name)?.amount;
  return (
    <div className="card pad">
      <div className="eyebrow">Export lot · {lot.code}</div>
      <h3 style={{ margin: "4px 0 2px" }}>
        {lot.totalKg}kg <span className={`pill commodity-${lot.commodity}`} style={{ marginLeft: 6 }}>{lot.commodity}</span>
      </h3>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {lot.contributions.length} origin farms · {located} geolocated · <StatusPill status={lot.status} />
      </div>
      <div className="trace-rows">
        {lot.contributions.map((c: any) => (
          <div className="trace-row" key={c.farmerId}>
            <span>{c.farmerName}{c.lat == null ? " ⚠" : ""}</span>
            <b>{c.quantityKg}kg{payOf(c.farmerName) != null ? ` · ${fmtUsdc(payOf(c.farmerName))} USDC` : ""}</b>
          </div>
        ))}
      </div>
      {disb?.status === "success" ? (
        <>
          <div className="trace-row" style={{ fontWeight: 700, borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 8 }}>
            <span>Total disbursed</span><b>{fmtUsdc(disb.totalAmount)} USDC</b>
          </div>
          {disb.explorer && <a className="link" href={disb.explorer} target="_blank" rel="noreferrer">batch payment on-chain ↗</a>}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {disb?.status === "failed" ? "Last disbursement failed — retry from the engine." : "Not yet disbursed."}
        </div>
      )}
      {located < lot.contributions.length && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>⚠ farms without an approved pin aren't EUDR trace-grade yet.</div>
      )}
    </div>
  );
}
