import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { App3d } from "./ui/App3d";
import { getRendererMode } from "./rendererMode";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element not found");
}

const RendererRoot = getRendererMode() === "3d" ? App3d : App;

createRoot(root).render(
  <StrictMode>
    <RendererRoot />
  </StrictMode>
);
