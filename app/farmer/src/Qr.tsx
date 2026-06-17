import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value, size = 168 }: { value: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#1b4d3e", light: "#ffffff" } })
      .then(setUrl)
      .catch(() => setUrl(""));
  }, [value, size]);
  return url ? (
    <img src={url} width={size} height={size} alt="shipment QR" style={{ borderRadius: 10, border: "1px solid var(--line)" }} />
  ) : (
    <div style={{ width: size, height: size }} className="muted" />
  );
}
