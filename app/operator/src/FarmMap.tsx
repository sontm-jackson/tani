import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtUsdc } from "@shared/api";

// A small CSS pin (divIcon avoids Leaflet's broken default-image paths under bundlers).
const pin = L.divIcon({ className: "", html: '<div class="farm-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
const pinPending = L.divIcon({ className: "", html: '<div class="farm-pin pending"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });

export function FarmMap({ farmers }: { farmers: any[] }) {
  const located = farmers.filter((f) => f.lat != null && f.lng != null);
  const pendingReqs = farmers.filter((f) => f.pendingLat != null && f.pendingLng != null);
  const first = located[0] ?? (pendingReqs[0] ? { lat: pendingReqs[0].pendingLat, lng: pendingReqs[0].pendingLng } : null);
  const center: [number, number] = first
    ? [first.lat, first.lng]
    : [11.85, 108.4]; // Lâm Đồng, Central Highlands

  return (
    <div className="section">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ flex: 1 }}>Farm origin map</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {located.length} of {farmers.length} located{pendingReqs.length ? ` · ${pendingReqs.length} pending` : ""}
        </span>
      </div>
      <p className="sub" style={{ marginTop: -4 }}>
        Every farm is a node — its location, story, and verified payments. The traceability origin for EUDR.
      </p>
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <MapContainer center={center} zoom={9} scrollWheelZoom style={{ height: 520, width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {located.map((f) => (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={pin}>
              <Popup>
                <div className="farm-pop">
                  <div className="fp-name">{f.name}</div>
                  <div className="fp-sub">{f.village}{f.yearsFarming ? ` · ${f.yearsFarming} yrs farming` : ""}</div>
                  {f.bio && <div className="fp-bio">{f.bio}</div>}
                  <div className="fp-meta">{f.household ?? ""}{f.status === "pending" ? " · pending approval" : ""}</div>
                  <div className="fp-stat">Received <b>{fmtUsdc(f.totalReceived)} USDC</b></div>
                </div>
              </Popup>
            </Marker>
          ))}
          {pendingReqs.map((f) => (
            <Marker key={`p-${f.id}`} position={[f.pendingLat, f.pendingLng]} icon={pinPending}>
              <Popup>
                <div className="farm-pop">
                  <div className="fp-name">{f.name}</div>
                  <div className="fp-sub">Proposed location · awaiting approval</div>
                  <div className="fp-meta">{f.lat != null ? "Moves the current pin" : "First location"}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
