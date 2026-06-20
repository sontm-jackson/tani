import { FarmProfile } from "./FarmProfile";
import { PayoutCard } from "./PayoutCard";
import { Collapsible } from "./Collapsible";

// Account screen: everything that defines the farmer node — identity, farm
// location + story, payout destination — plus sign out, in one place.
export function Profile({ farmer, onChange, onSignOut }: { farmer: any; onChange: (f: any) => void; onSignOut: () => void }) {
  const initials = farmer.name.split(" ").filter(Boolean).slice(-2).map((w: string) => w[0]).join("").toUpperCase();
  const active = farmer.status !== "pending";

  const hasApproved = farmer.lat != null && farmer.lng != null;
  const hasPending = farmer.pendingLat != null && farmer.pendingLng != null;
  const farmSummary = hasApproved
    ? `📍 ${farmer.village || `${farmer.lat.toFixed(3)}, ${farmer.lng.toFixed(3)}`}${hasPending ? " · update pending" : ""}${farmer.bio ? ` · ${farmer.bio}` : ""}`
    : hasPending
      ? "📍 Location pending co-op approval"
      : "Set your farm location and story";

  const paySummary = farmer.payout
    ? `${farmer.payout.provider} ••••${(farmer.payout.account || "").slice(-4)}`
    : "No payout destination yet";

  return (
    <>
      <div className="profile-head">
        {farmer.photoUrl
          ? <img className="profile-avatar" src={farmer.photoUrl} alt={farmer.name} />
          : <div className="profile-avatar">{initials}</div>}
        <div className="profile-id">
          <div className="profile-name">{farmer.name}</div>
          <div className="profile-meta">
            {farmer.village ? `${farmer.village} · ` : ""}
            <span className={`pill ${active ? "pill-success" : "pill-pending"}`}>{active ? "Active" : "Pending approval"}</span>
          </div>
        </div>
      </div>

      <Collapsible title="Your farm" summary={farmSummary} defaultOpen={!hasApproved && !hasPending}>
        <FarmProfile farmer={farmer} onSaved={onChange} />
      </Collapsible>

      <Collapsible title="Payout destination" summary={paySummary} defaultOpen={!farmer.payout}>
        <PayoutCard farmer={farmer} onSaved={onChange} bare />
      </Collapsible>

      <button className="btn-ghost block signout-btn" onClick={onSignOut}>Sign out</button>
    </>
  );
}
