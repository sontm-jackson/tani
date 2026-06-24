import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, fmtUsdc } from "@shared/api";

// Sovereignty handling (stopgap until we move to a Vietnamese map provider):
// - TILE_BOUNDS limits OSM raster tiles to the Vietnamese mainland, so the
//   contested East Sea area never renders — and therefore no foreign island
//   labels appear (you can't edit text baked into raster tiles).
// - VN_BOUNDS lets the view reach the islands so we can label them ourselves.
// - We then overlay our own Hoàng Sa / Trường Sa labels (Việt Nam) on the blank
//   (sea-tinted) area.
const TILE_BOUNDS: [[number, number], [number, number]] = [[7.5, 101.5], [23.8, 110.0]];
const VN_BOUNDS: [[number, number], [number, number]] = [[6.0, 101.5], [23.8, 118.0]];
const HOANG_SA: [number, number] = [16.5, 112.0];
const TRUONG_SA: [number, number] = [9.4, 114.2];

function islandIcon(name: string) {
  return L.divIcon({
    className: "",
    html: `<div class="vn-island"><b>${name}</b><span>(Việt Nam)</span></div>`,
    iconSize: [104, 24], iconAnchor: [52, 12],
  });
}
const hoangSaIcon = islandIcon("Quần đảo Hoàng Sa");
const truongSaIcon = islandIcon("Quần đảo Trường Sa");

const pinDim = L.divIcon({ className: "", html: '<div class="farm-pin dim"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
const pinHot = L.divIcon({ className: "", html: '<div class="farm-pin hot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
const pin = L.divIcon({ className: "", html: '<div class="farm-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });

type Result =
  | { kind: "shipment"; s: any }
  | { kind: "lot"; lot: any; disb: any | null }
  | { kind: "farm"; f: any }
  | null;

export function Trace({ farmers, disbursements }: { farmers: any[]; disbursements: any[] }) {
  const [lots, setLots] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api.lots().then(setLots).catch(() => {}); }, []);

  async function search() { runTrace(q); }

  async function runTrace(raw: string) {
    const v = raw.trim();
    setQ(raw);
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

  // which farms are highlighted (search or a clicked pin) — the map never moves on its own
  const hotIds = new Set<string>();
  if (result?.kind === "shipment" && result.s.farmerLat != null) {
    hotIds.add(result.s.farmerId);
  } else if (result?.kind === "lot") {
    for (const c of result.lot.contributions) hotIds.add(c.farmerId);
  } else if (result?.kind === "farm" && result.f.lat != null) {
    hotIds.add(result.f.id);
  }

  const located = farmers.filter((f) => f.lat != null && f.lng != null);
  // only a *searched* result dims the other pins; a clicked farm leaves the map as-is
  const active = result != null && result.kind !== "farm";

  return (
    <div className="section">
      <div className="trace-head">
        <div>
          <h2 style={{ margin: 0 }}>Trace</h2>
        </div>
        <span className="trace-count">{located.length} / {farmers.length} farms geolocated</span>
      </div>

      <div className="card pad trace-search">
        <div className="trace-search-row">
          <div className="trace-field">
            <SearchIcon />
            <input placeholder="QR code (TANI-…) or lot code (LOT-…)" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <button className="btn-green" onClick={search}>Trace</button>
          {active && <button className="btn-ghost" onClick={() => { setQ(""); setResult(null); setErr(""); }}>Clear</button>}
        </div>
        {err &&<div className="notice notice-err" style={{ marginBottom: 0, marginTop: 12 }}>{err}</div>}
      </div>

      <div className="trace-grid">
        <div className="card trace-map">
          <MapContainer center={[11.85, 108.4]} zoom={9} minZoom={5} maxBounds={VN_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom style={{ height: 600, width: "100%" }}>
            <TileLayer bounds={TILE_BOUNDS} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            <Marker position={HOANG_SA} icon={hoangSaIcon} interactive={false} />
            <Marker position={TRUONG_SA} icon={truongSaIcon} interactive={false} />
            {located.map((f) => {
              const hot = hotIds.has(f.id);
              return (
                <Marker key={f.id} position={[f.lat, f.lng]} icon={hot ? pinHot : active ? pinDim : pin}
                  eventHandlers={{ click: () => setResult({ kind: "farm", f }) }} />
              );
            })}
          </MapContainer>
          <div className="trace-legend">
            <span><i className="ldot hot" />Traced origin</span>
            <span><i className="ldot warm" />Farm</span>
            <span className="trace-legend-sp" />
            <span className="muted">Hoàng Sa &amp; Trường Sa · Việt Nam</span>
          </div>
        </div>

        <div className="trace-panel">
          {!result && <TraceEmpty />}
          {result?.kind === "farm" && <FarmTrace f={result.f} />}
          {result?.kind === "shipment" && <ShipmentTrace s={result.s} />}
          {result?.kind === "lot" && <LotTrace lot={result.lot} disb={result.disb} />}
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function TraceEmpty() {
  return (
    <div className="card pad trace-empty muted">
      Click a farm on the map to see its origin, story, and payments — or search a bag's QR or an export lot above.
    </div>
  );
}

function FarmTrace({ f }: { f: any }) {
  const located = f.lat != null && f.lng != null;
  const explorer = f.publicKey ? `https://stellar.expert/explorer/testnet/account/${f.publicKey}` : null;

  // Reverse-geocode the pin to a readable place name (the precise point is kept below
  // as the EUDR trace point). Falls back to coordinates if the lookup is unavailable.
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    setPlace(null);
    if (!located) return;
    let cancelled = false;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${f.lat}&lon=${f.lng}&zoom=12&accept-language=vi`;
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.display_name) setPlace(d.display_name.split(",").slice(0, 3).join(",").trim()); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [f.lat, f.lng, located]);

  return (
    <div className="card trace-card">
      <div className="trace-card-head">
        <div className="eyebrow">Farm origin</div>
        <h3>{f.name}</h3>
        <div className="trace-sub">
          <span>{f.village}{f.yearsFarming ? ` · ${f.yearsFarming} yrs farming` : ""}</span>
          {located ? <span className="pill pill-success">pinned</span> : <span className="pill pill-pending">no pin</span>}
        </div>
      </div>
      <div className="trace-card-body">
        {f.bio && <p className="trace-bio">{f.bio}</p>}
        <div className="trace-rows">
          {f.farmSizeHa != null && <div className="trace-row"><span>Farm size</span><b>{f.farmSizeHa} ha</b></div>}
          {located && <div className="trace-row"><span>Location</span><b>{place ?? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`}</b></div>}
          {located && <div className="trace-row"><span>EUDR point</span><b>{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</b></div>}
          <div className="trace-row"><span>Wallet balance</span><b>{fmtUsdc(f.balance)} USDC</b></div>
        </div>
        <div className="trace-paid">
          <div>
            <div className="trace-paid-lbl">Total received</div>
            <div className="trace-paid-amt">{fmtUsdc(f.totalReceived)} USDC</div>
          </div>
          {explorer && <a className="trace-onchain" href={explorer} target="_blank" rel="noreferrer">wallet ↗</a>}
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
    <div className="card trace-card">
      <div className="trace-card-head">
        <div className="eyebrow">Bag · {s.qrToken}</div>
        <h3>{s.farmerName}</h3>
        <div className="trace-sub">
          <span>{s.village}{s.farmerLat != null ? " · origin pinned" : " · no location"}</span>
          <StatusPill status={s.status} />
        </div>
      </div>
      <div className="trace-card-body">
        <div className="trace-rows">
          {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <div className="trace-row" key={k}><span>{k}</span><b>{String(v)}</b></div>
          ))}
        </div>
        {s.status === "paid" ? (
          <div className="trace-paid">
            <div>
              <div className="trace-paid-lbl">Paid on {s.verifiedKg}kg verified</div>
              <div className="trace-paid-amt">{fmtUsdc(s.amountPaid)} USDC</div>
            </div>
            {s.explorer && <a className="trace-onchain" href={s.explorer} target="_blank" rel="noreferrer">on-chain ↗</a>}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Not yet verified at arrival.</div>
        )}
      </div>
    </div>
  );
}

function LotTrace({ lot, disb }: { lot: any; disb: any | null }) {
  const located = lot.contributions.filter((c: any) => c.lat != null).length;
  const payOf = (name: string) => disb?.payments?.find((p: any) => p.farmerName === name)?.amount;
  return (
    <div className="card trace-card">
      <div className="trace-card-head">
        <div className="eyebrow">Export lot · {lot.code}</div>
        <h3>{lot.totalKg}kg <span className={`pill commodity-${lot.commodity}`}>{lot.commodity}</span></h3>
        <div className="trace-sub">
          <span>{lot.contributions.length} origin farms · {located} geolocated</span>
          <StatusPill status={lot.status} />
        </div>
      </div>
      <div className="trace-card-body">
        <div className="trace-rows">
          {lot.contributions.map((c: any) => (
            <div className="trace-row" key={c.farmerId}>
              <span>{c.farmerName}{c.lat == null && <span className="trace-warn">no pin</span>}</span>
              <b>{c.quantityKg}kg{payOf(c.farmerName) != null ? ` · ${fmtUsdc(payOf(c.farmerName))} USDC` : ""}</b>
            </div>
          ))}
        </div>
        {disb?.status === "success" ? (
          <div className="trace-paid">
            <div>
              <div className="trace-paid-lbl">Batch disbursed</div>
              <div className="trace-paid-amt">{fmtUsdc(disb.totalAmount)} USDC</div>
            </div>
            {disb.explorer && <a className="trace-onchain" href={disb.explorer} target="_blank" rel="noreferrer">on-chain ↗</a>}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {disb?.status === "failed" ? "Last disbursement failed." : "Not yet disbursed."}
          </div>
        )}
        {located < lot.contributions.length && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Farms without an approved pin aren't EUDR trace-grade yet.</div>
        )}
      </div>
    </div>
  );
}
