import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { themeService } from "./features/settings";

// Applied synchronously, before the first paint, so there's no flash
// of the wrong theme while React boots.
themeService.applyStored();
themeService.watchSystemChanges();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
