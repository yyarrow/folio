import React from "react";
import ReactDOM from "react-dom/client";
import { getUILanguage } from "../../lib/i18n";
import App from "./App";
import "./style.css";

document.documentElement.lang = getUILanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
