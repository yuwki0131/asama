import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Assets } from "pixi.js";
import { App } from "./ui/App";
import "./styles.css";

if (import.meta.env.DEV) {
  // dev バンドルで PIXI の worker テクスチャローダが停止する環境があるため main-thread ロード固定
  Assets.setPreferences({ preferWorkers: false });
}

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
