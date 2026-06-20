import { FarmProfile } from "./FarmProfile";
import { PayoutCard } from "./PayoutCard";

// Account screen: everything that defines the farmer node — identity, farm
// location + story, payout destination — plus sign out, in one place.
export function Profile({ farmer, onChange, onSignOut }: { farmer: any; onChange: (f: any) => void; onSignOut: () => void }) {
  const initials = farmer.name.split(" ").filter(Boolean).slice(-2).map((w: string) => w[0]).join("").toUpperCase();
  const active = farmer.status !== "pending";

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

      <FarmProfile farmer={farmer} onSaved={onChange} />

      <h2 className="sec-title">Payout destination</h2>
      <PayoutCard farmer={farmer} onSaved={onChange} />

      <button className="btn-ghost block signout-btn" onClick={onSignOut}>Sign out</button>
    </>
  );
}
