import React from "react";
import ReactDOM from "react-dom/client";
import "@shared/styles.css";
import Operator from "./Operator";

const peer = (import.meta as any).env?.VITE_PEER_URL ?? "";

function Header() {
  return (
    <div className="topbar">
      <div className="wrap">
        <div className="brand">
          Tani<span className="dot">.</span>
        </div>
        <div className="tagline">cooperative</div>
        <nav className="nav">
          {peer && (
            <a href={peer} target="_blank" rel="noreferrer">
              Farmer app ↗
            </a>
          )}
          <span className="badge" style={{ marginLeft: 8 }}>testnet</span>
        </nav>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Header />
    <Operator />
  </React.StrictMode>
);
