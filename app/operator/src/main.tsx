import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@shared/styles.css";
import "./operator.css";
import Operator from "./Operator";
import { Login } from "./Login";
import { api } from "@shared/api";

function App() {
  const [authed, setAuthed] = useState(api.hasToken());
  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  return <Operator onLogout={() => { api.clearToken(); setAuthed(false); }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
