// React wrapper for the trial 3D renderer.
//
// Mounted in place of the shipped PixiJS GameCanvas when the URL is
// ?renderer=3d. Owns a canvas element, one ThreeScene, pointer/keyboard
// input, and a resize observer. The animation loop runs at requestAnimationFrame
// cadence and re-renders whenever a snapshot arrives.

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { forwardRef } from "react";
import type { CellCoord, WorldSnapshot } from "@asama/shared";
import { createThreeScene, type ThreeSceneHandle } from "./ThreeScene";
import { loadThreeAssets, type ThreeAssetMap } from "./assets";
import { trialFeatures } from "./trialFeatures";
import { cellToScreen } from "./picker";

export interface ThreeGameCanvasHandle {
  cellToScreenPoint(cell: CellCoord): { x: number; y: number } | null;
  jumpCameraToCell(cell: CellCoord): void;
  getFps(): number;
  setTone(_enabled: boolean): void;
}

export interface ThreeGameCanvasProps {
  snapshot: WorldSnapshot | null;
  onCellSelected?: (cell: CellCoord | null) => void;
}

export const ThreeGameCanvas = forwardRef<ThreeGameCanvasHandle, ThreeGameCanvasProps>(
  function ThreeGameCanvas(props, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sceneRef = useRef<ThreeSceneHandle | null>(null);
    const assetsRef = useRef<ThreeAssetMap | null>(null);
    const pendingSnapshotRef = useRef<WorldSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const fpsRef = useRef({ frames: 0, lastFpsTime: performance.now(), fps: 0 });

    // Load textures once, then create the scene.
    useEffect(() => {
      let cancelled = false;
      loadThreeAssets()
        .then((assets) => {
          if (cancelled) return;
          assetsRef.current = assets;
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (canvas === null || container === null) return;
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          const scene = createThreeScene({
            canvas,
            assets,
            trialFeatures,
          });
          sceneRef.current = scene;
          if (pendingSnapshotRef.current !== null) {
            scene.setSnapshot(pendingSnapshotRef.current);
          }
          setReady(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, []);

    // Push snapshots into the scene as they arrive.
    useEffect(() => {
      pendingSnapshotRef.current = props.snapshot;
      const scene = sceneRef.current;
      if (scene !== null && props.snapshot !== null) {
        scene.setSnapshot(props.snapshot);
      }
    }, [props.snapshot]);

    // Animation loop.
    useEffect(() => {
      if (!ready) return;
      let raf = 0;
      const frame = () => {
        const scene = sceneRef.current;
        if (scene !== null) {
          scene.render();
          const now = performance.now();
          const state = fpsRef.current;
          state.frames += 1;
          if (now - state.lastFpsTime >= 1000) {
            state.fps = (state.frames * 1000) / (now - state.lastFpsTime);
            state.frames = 0;
            state.lastFpsTime = now;
          }
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }, [ready]);

    // Resize observer.
    useEffect(() => {
      const container = containerRef.current;
      if (container === null) return;
      const observer = new ResizeObserver(() => {
        const scene = sceneRef.current;
        if (scene !== null) {
          scene.resize(container.clientWidth, container.clientHeight);
        }
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    // Pointer handlers: left click selects a cell.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const onClick = (event: MouseEvent) => {
        const scene = sceneRef.current;
        if (scene === null) return;
        const rect = canvas.getBoundingClientRect();
        const cell = scene.pickCellAt(event.clientX, event.clientY, rect);
        scene.setSelectedCell(cell);
        props.onCellSelected?.(cell);
      };
      canvas.addEventListener("click", onClick);
      return () => canvas.removeEventListener("click", onClick);
    }, [props.onCellSelected]);

    // Middle-drag / Shift+left-drag: pan; wheel: zoom.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      let dragging = false;
      let last = { x: 0, y: 0 };
      const onDown = (e: MouseEvent) => {
        if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
        dragging = true;
        last = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      };
      const onMove = (e: MouseEvent) => {
        if (!dragging) return;
        const scene = sceneRef.current;
        if (scene === null) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        scene.camera.panByScreen(dx, dy, canvas.height);
      };
      const onUp = () => {
        dragging = false;
      };
      const onWheel = (e: WheelEvent) => {
        const scene = sceneRef.current;
        if (scene === null) return;
        e.preventDefault();
        // Convention matches the 2D renderer: wheel-up (deltaY < 0) zooms in.
        scene.camera.zoomStep(e.deltaY > 0 ? -1 : 1, canvas.width, canvas.height);
      };
      canvas.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        canvas.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        canvas.removeEventListener("wheel", onWheel);
      };
    }, []);

    // Keyboard camera controls: arrow keys / WASD pan, +/- zoom, Home recenters.
    useEffect(() => {
      const pressed = new Set<string>();
      const onKeyDown = (e: KeyboardEvent) => {
        // Ignore typing in inputs / textareas.
        const target = e.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        pressed.add(e.key);
        const canvas = canvasRef.current;
        const scene = sceneRef.current;
        if (canvas === null || scene === null) return;
        // Instant actions (not tied to hold-loop):
        if (e.key === "+" || e.key === "=") {
          scene.camera.zoomStep(1, canvas.width, canvas.height);
          e.preventDefault();
        } else if (e.key === "-" || e.key === "_") {
          scene.camera.zoomStep(-1, canvas.width, canvas.height);
          e.preventDefault();
        } else if (e.key === "Home") {
          scene.camera.centerOnCell({ x: 52, y: 52 });
          scene.camera.updateProjection(canvas.width, canvas.height);
          e.preventDefault();
        } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)) {
          e.preventDefault();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        pressed.delete(e.key);
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      // Hold-loop for smooth arrow/WASD panning at ~60Hz.
      const PAN_PX_PER_FRAME = 12;
      let raf = 0;
      const step = () => {
        const canvas = canvasRef.current;
        const scene = sceneRef.current;
        if (canvas !== null && scene !== null && pressed.size > 0) {
          let dx = 0;
          let dy = 0;
          if (pressed.has("ArrowLeft") || pressed.has("a") || pressed.has("A")) dx += PAN_PX_PER_FRAME;
          if (pressed.has("ArrowRight") || pressed.has("d") || pressed.has("D")) dx -= PAN_PX_PER_FRAME;
          if (pressed.has("ArrowUp") || pressed.has("w") || pressed.has("W")) dy += PAN_PX_PER_FRAME;
          if (pressed.has("ArrowDown") || pressed.has("s") || pressed.has("S")) dy -= PAN_PX_PER_FRAME;
          if (dx !== 0 || dy !== 0) {
            scene.camera.panByScreen(dx, dy, canvas.height);
          }
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        cancelAnimationFrame(raf);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        cellToScreenPoint(cell) {
          const scene = sceneRef.current;
          const canvas = canvasRef.current;
          if (scene === null || canvas === null) return null;
          return cellToScreen(cell, 0, scene.camera.camera, canvas.width, canvas.height);
        },
        jumpCameraToCell(cell) {
          const scene = sceneRef.current;
          const canvas = canvasRef.current;
          if (scene === null || canvas === null) return;
          scene.camera.centerOnCell(cell);
          scene.camera.updateProjection(canvas.width, canvas.height);
        },
        getFps() {
          return fpsRef.current.fps;
        },
        setTone(_enabled) {
          // Trial renderer has no tone-grade toggle; noop keeps the DEV
          // asamaTest bridge shape consistent with the 2D renderer.
        },
      }),
      []
    );

    return (
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", position: "relative", background: "#d6d3c0" }}
        data-renderer-mode="3d"
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        />
        {error !== null && (
          <div className="error-text" style={{ position: "absolute", top: 8, left: 8 }}>
            3D renderer error: {error}
          </div>
        )}
        {!ready && error === null && (
          <div style={{ position: "absolute", top: 8, left: 8, color: "#333" }}>
            3Dレンダラー準備中…
          </div>
        )}
      </div>
    );
  }
);
