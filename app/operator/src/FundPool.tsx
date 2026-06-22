import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Fund the payout pool: deposit USDC to the pool's Stellar address (production),
// or mint test USDC straight in (testnet shortcut).
export function FundPool({ address, explorer, busy, onMint, onClose }: {
  address: string; explorer?: string; busy: boolean; onMint: (n: number) => void; onClose: () => void;
}) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [amt, setAmt] = useState("2000");

  useEffect(() => {
    QRCode.toDataURL(address, { width: 480, margin: 1, color: { dark: "#1b4d3e", light: "#ffffff" } })
      .then(setQr).catch(() => {});
  }, [address]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked; user can select manually */ }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Fund the payout pool</div>
        <h2 style={{ margin: "2px 0 4px" }}>Deposit USDC</h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          Send USDC to the pool's Stellar address. In production this is real USDC from the co-op
          treasury or, in the escrow model, from the buyer.
        </p>

        <div className="fund-qr">
          {qr ? <img src={qr} width={184} height={184} alt="Pool address QR" /> : <div className="fund-qr-ph" />}
        </div>

        <div className="fund-addr">
          <code>{address}</code>
          <button className="btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
        {explorer && (
          <a className="link" href={explorer} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
            view pool account on-chain ↗
          </a>
        )}

        <div className="fund-divider"><span>testnet shortcut</span></div>

        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-primary" disabled={busy || !Number(amt)} onClick={() => onMint(Number(amt))}>
            {busy ? "Minting…" : "Mint test USDC"}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Mints test USDC straight into the pool to simulate the fiat on-ramp. Testnet only.
        </p>

        <button className="btn-ghost block" style={{ marginTop: 18 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
