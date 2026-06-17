import React from "react";
import ReactDOM from "react-dom/client";
import "@shared/styles.css";
import "./mobile.css";
import Farmer from "./Farmer";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Farmer />
  </React.StrictMode>
);
