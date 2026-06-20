import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@shared/api";

const pin = L.divIcon({ className: "", html: '<div class="farm-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function Picker({ pos, onPick }: { pos: [number, number] | null; onPick: (la: number, ln: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return pos ? <Marker position={pos} icon={pin} /> : null;
}

export function FarmProfile({ farmer, onSaved }: { farmer: any; onSaved: (f: any) => void }) {
  const [lat, setLat] = useState<number | null>(farmer.lat ?? null);
  const [lng, setLng] = useState<number | null>(farmer.lng ?? null);
  const [bio, setBio] = useState(farmer.bio ?? "");
  const [household, setHousehold] = useState(farmer.household ?? "");
  const [years, setYears] = useState(farmer.yearsFarming != null ? String(farmer.yearsFarming) : "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [11.85, 108.4];

  async function save() {
    setBusy(true); setNotice(null);
    try {
      const f = await api.meProfile({
        bio, household,
        yearsFarming: years ? Number(years) : undefined,
        lat: lat ?? undefined, lng: lng ?? undefined,
      });
      onSaved(f);
      setNotice({ ok: true, msg: "Farm profile saved." });
    } catch (e: any) {
      setNotice({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="sec-title">Your farm location</h2>
      <div className="card pad">
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Tap the map to drop a pin on your farm.</div>
        <div className="farm-map-wrap">
          <MapContainer center={center} zoom={lat != null ? 13 : 9} style={{ height: 240, width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <Picker pos={lat != null && lng != null ? [lat, lng] : null} onPick={(la, ln) => { setLat(la); setLng(ln); }} />
          </MapContainer>
        </div>
        {lat != null && lng != null
          ? <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>📍 {lat.toFixed(5)}, {lng.toFixed(5)}</div>
          : <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>No location set yet.</div>}
      </div>

      <h2 className="sec-title">About you</h2>
      <div className="card pad">
        <div className="field"><label>Your story</label>
          <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="e.g. Third-generation coffee grower" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field"><label>Household</label>
            <input value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="Family of 5" /></div>
          <div className="field"><label>Years farming</label>
            <input type="number" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} /></div>
        </div>
        <button className="btn-green block" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save farm profile"}</button>
        {notice && <div className={`notice ${notice.ok ? "notice-ok" : "notice-err"}`}>{notice.msg}</div>}
      </div>
    </>
  );
}
