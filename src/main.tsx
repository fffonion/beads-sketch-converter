import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerPwaServiceWorker, shouldRegisterPwaServiceWorker } from "./lib/pwa-register";

if (shouldRegisterPwaServiceWorker(import.meta.env)) {
  void registerPwaServiceWorker(import.meta.env.BASE_URL);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
