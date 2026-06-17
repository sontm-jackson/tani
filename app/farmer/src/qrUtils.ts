import QRCode from "qrcode";

// Download the QR as a high-res PNG the farmer can print and attach to the bag.
export async function downloadQr(token: string) {
  const url = await QRCode.toDataURL(token, {
    width: 720, margin: 2, color: { dark: "#1b4d3e", light: "#ffffff" },
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = `tani-${token}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Open a print-ready label (QR + product + token) and trigger the print dialog.
export async function printLabel(s: any) {
  const url = await QRCode.toDataURL(s.qrToken, {
    width: 600, margin: 2, color: { dark: "#1b4d3e", light: "#ffffff" },
  });
  const w = window.open("", "_blank", "width=420,height=620");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${s.qrToken}</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:28px;color:#1a2420;margin:0}
      .brand{font-weight:700;font-size:20px;color:#1b4d3e}
      .brand span{color:#e09f3e}
      img{width:300px;height:300px;margin:14px 0}
      h2{margin:6px 0 2px;font-size:18px}
      p{margin:2px;color:#5c6b63;font-size:13px}
      .token{font-weight:700;letter-spacing:1px;color:#1b4d3e;margin-top:8px}
    </style></head>
    <body>
      <div class="brand">Tani<span>.</span></div>
      <img src="${url}"/>
      <h2>${s.variety} · ${s.claimedKg}kg</h2>
      <p>${s.grade ?? ""}${s.certification ? " · " + s.certification : ""}</p>
      <div class="token">${s.qrToken}</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
  w.document.close();
}
