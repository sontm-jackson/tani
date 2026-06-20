import { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@shared/api";

const pin = L.divIcon({ className: "", html: '<div class="farm-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function Picker({ pos, onPick }: { pos: [number, number] | null; onPick: (la: number, ln: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return pos ? <Marker position={pos} icon={pin} /> : null;
}

// Flies the map to a target when it changes (search result selected).
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo(target, 15, { duration: 0.8 }); }, [target]);
  return null;
}

type Place = { lat: string; lon: string; display_name: string };

// Search a place by name via OpenStreetMap's free Nominatim geocoder, biased to Vietnam.
function PlaceSearch({ onPick }: { onPick: (la: number, ln: number, label: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function onChange(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&limit=5&q=${encodeURIComponent(v)}`;
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); } finally { setBusy(false); }
    }, 500);
  }

  function choose(p: Place) {
    onPick(parseFloat(p.lat), parseFloat(p.lon), p.display_name.split(",").slice(0, 2).join(", "));
    setResults([]);
    setQ(p.display_name.split(",").slice(0, 2).join(", "));
  }

  return (
    <div className="map-search">
      <input value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search your village or commune…" />
      {busy && <span className="map-search-spin">…</span>}
      {results.length > 0 && (
        <div className="map-search-results">
          {results.map((p, i) => (
            <button key={i} type="button" onClick={() => choose(p)}>{p.display_name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FarmProfile({ farmer, onSaved }: { farmer: any; onSaved: (f: any) => void }) {
  const [lat, setLat] = useState<number | null>(farmer.lat ?? null);
  const [lng, setLng] = useState<number | null>(farmer.lng ?? null);
  const [bio, setBio] = useState(farmer.bio ?? "");
  const [household, setHousehold] = useState(farmer.household ?? "");
  const [years, setYears] = useState(farmer.yearsFarming != null ? String(farmer.yearsFarming) : "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [target, setTarget] = useState<[number, number] | null>(null);

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
      <h2 className="sec-title">Your farm</h2>
      <div className="card pad">
        <div className="form-group-label">Location</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Search your area, then tap the map to drop a pin on your farm.</div>
        <PlaceSearch onPick={(la, ln) => { setLat(la); setLng(ln); setTarget([la, ln]); }} />
        <div className="farm-map-wrap">
          <MapContainer center={center} zoom={lat != null ? 13 : 9} style={{ height: 240, width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <FlyTo target={target} />
            <Picker pos={lat != null && lng != null ? [lat, lng] : null} onPick={(la, ln) => { setLat(la); setLng(ln); }} />
          </MapContainer>
        </div>
        {lat != null && lng != null
          ? <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>📍 {lat.toFixed(5)}, {lng.toFixed(5)}</div>
          : <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>No location set yet.</div>}

        <div className="form-group-label" style={{ marginTop: 20 }}>Farm story</div>
        <div className="field"><label>Your story</label>
          <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="e.g. Third-generation coffee grower" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field"><label>Household</label>
            <input value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="Family of 5" /></div>
          <div className="field"><label>Years farming</label>
            <input type="number" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} /></div>
        </div>

        <button className="btn-green block" onClick={save} disabled={busy} style={{ marginTop: 6 }}>{busy ? "Saving…" : "Save farm details"}</button>
        {notice && <div className={`notice ${notice.ok ? "notice-ok" : "notice-err"}`}>{notice.msg}</div>}
      </div>
    </>
  );
}
