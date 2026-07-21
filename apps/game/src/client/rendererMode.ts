// Renderer selection for the hybrid 3D trial (?renderer=2d|3d).
//
// The default remains the shipped PixiJS 2D renderer. The trial 3D renderer
// is opt-in via URL parameter; production and CI never boot it unless the
// query string explicitly asks for it.

export type RendererMode = "2d" | "3d";

const DEFAULT_MODE: RendererMode = "2d";

export function parseRendererMode(search: string): RendererMode {
  const params = new URLSearchParams(search);
  const raw = params.get("renderer");
  if (raw === "3d") return "3d";
  if (raw === "2d") return "2d";
  return DEFAULT_MODE;
}

export function getRendererMode(): RendererMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  return parseRendererMode(window.location.search);
}

export const TRIAL_SCENARIO_ID = "hybrid-renderer-trial";
