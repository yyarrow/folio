import React from "react";
import ReactDOM from "react-dom/client";
import { getUILanguage } from "../../lib/i18n";
import App from "./App";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/newsreader/opsz.css";
import "./tokens.css";
import "./style.css";

document.documentElement.lang = getUILanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
