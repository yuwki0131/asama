import { Container, Graphics } from "pixi.js";
import type {
  AttackMeleeEventSnapshot,
  AttackRangedEventSnapshot,
  CombatEventSnapshot,
  WorldSnapshot
} from "@asama/shared";
import { cellToWorld, type CameraState } from "./camera";
import type { LoadedAsset } from "./assets";

// --- Effect durations (ms) ---

const ARROW_DURATION_MS = 400;
const FLASH_DURATION_MS = 200;
const SMOKE_DURATION_MS = 700;
const SPARK_DURATION_MS = 250;
const PUFF_DURATION_MS = 600;

// --- Effect colors ---

const ARROW_COLOR = 0xb89a50;
const FLASH_COLOR = 0xfffaaa;
const SMOKE_COLOR = 0xaaaaaa;
const MELEE_SPARK_COLOR = 0xff8844;
const RANGED_SPARK_COLOR = 0xeeeeff;
const PUFF_COLOR = 0x888888;

// --- Internal effect data types ---

interface BaseEffect {
  readonly gfx: Graphics;
  elapsed: number;
  readonly duration: number;
}

interface ArrowEffect extends BaseEffect {
  readonly kind: "arrow";
  readonly srcX: number;
  readonly srcY: number;
  readonly dstX: number;
  readonly dstY: number;
}

interface FlashEffect extends BaseEffect {
  readonly kind: "flash";
}

interface SmokeEffect extends BaseEffect {
  readonly kind: "smoke";
  readonly baseY: number;
  /** Total Y drift (negative = upward on screen) over the full duration. */
  readonly totalDriftY: number;
}

interface SparkEffect extends BaseEffect {
  readonly kind: "spark";
}

interface PuffEffect extends BaseEffect {
  readonly kind: "puff";
  readonly baseY: number;
  /** Total Y drift (negative = upward on screen) over the full duration. */
  readonly totalDriftY: number;
}

type Effect = ArrowEffect | FlashEffect | SmokeEffect | SparkEffect | PuffEffect;

// --- Helpers ---

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function worldPos(cell: { readonly x: number; readonly y: number }): { x: number; y: number } {
  return cellToWorld(cell);
}

// --- Effect builders ---

function buildArrow(srcX: number, srcY: number, dstX: number, dstY: number): ArrowEffect {
  const gfx = new Graphics();
  // Chevron/arrowhead pointing in the +X direction; will be rotated to face travel direction.
  // Shape: tip at (+5, 0), back corners at (-3, ±3), center notch at (-1, 0).
  gfx
    .moveTo(5, 0)
    .lineTo(-3, 3)
    .lineTo(-1, 0)
    .lineTo(-3, -3)
    .closePath()
    .fill({ color: ARROW_COLOR });
  gfx.rotation = Math.atan2(dstY - srcY, dstX - srcX);
  gfx.x = srcX;
  gfx.y = srcY;
  return { kind: "arrow", gfx, elapsed: 0, duration: ARROW_DURATION_MS, srcX, srcY, dstX, dstY };
}

function buildFlash(x: number, y: number): FlashEffect {
  const gfx = new Graphics();
  gfx.ellipse(0, 0, 9, 6).fill({ color: FLASH_COLOR });
  gfx.x = x;
  gfx.y = y;
  gfx.alpha = 0;
  return { kind: "flash", gfx, elapsed: 0, duration: FLASH_DURATION_MS };
}

function buildSmoke(x: number, y: number): SmokeEffect {
  const gfx = new Graphics();
  gfx.ellipse(0, 0, 10, 6).fill({ color: SMOKE_COLOR });
  gfx.x = x;
  gfx.y = y;
  gfx.alpha = 0.6;
  return { kind: "smoke", gfx, elapsed: 0, duration: SMOKE_DURATION_MS, baseY: y, totalDriftY: -20 };
}

function buildSpark(x: number, y: number, attackerId: string, color: number): SparkEffect {
  const gfx = new Graphics();
  const baseAngle = (hashString(attackerId) % 1000) / 1000 * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const angle = baseAngle + i * ((Math.PI * 2) / 6);
    gfx
      .moveTo(0, 0)
      .lineTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
  }
  gfx.stroke({ color, width: 1.5 });
  gfx.x = x;
  gfx.y = y;
  return { kind: "spark", gfx, elapsed: 0, duration: SPARK_DURATION_MS };
}

function buildPuff(x: number, y: number): PuffEffect {
  const gfx = new Graphics();
  // Three overlapping circles drawn separately so each gets its own fill call.
  gfx.ellipse(-5, 3, 10, 8).fill({ color: PUFF_COLOR });
  gfx.ellipse(0, -3, 10, 8).fill({ color: PUFF_COLOR });
  gfx.ellipse(5, 3, 10, 8).fill({ color: PUFF_COLOR });
  gfx.x = x;
  gfx.y = y;
  return { kind: "puff", gfx, elapsed: 0, duration: PUFF_DURATION_MS, baseY: y, totalDriftY: -24 };
}

// --- Per-frame state update ---

function applyFrame(effect: Effect): void {
  const t = effect.elapsed / effect.duration; // 0..1
  switch (effect.kind) {
    case "arrow": {
      effect.gfx.x = effect.srcX + (effect.dstX - effect.srcX) * t;
      effect.gfx.y = effect.srcY + (effect.dstY - effect.srcY) * t;
      break;
    }
    case "flash": {
      // Alpha and scale ramp up then back down: peaks at t=0.5.
      const peak = t < 0.5 ? t * 2 : (1 - t) * 2;
      effect.gfx.alpha = peak;
      effect.gfx.scale.set(0.2 + peak * 0.8);
      break;
    }
    case "smoke": {
      effect.gfx.y = effect.baseY + effect.totalDriftY * t;
      effect.gfx.alpha = 0.6 * (1 - t);
      break;
    }
    case "spark": {
      effect.gfx.alpha = 1 - t;
      break;
    }
    case "puff": {
      effect.gfx.y = effect.baseY + effect.totalDriftY * t;
      effect.gfx.alpha = 1 - t;
      break;
    }
  }
}

// --- Public API ---

/**
 * Manages short-lived combat visual effects (arrows, muzzle flashes, hit
 * sparks, building-destroyed puffs).  Effects live in world space — the root
 * container should be added to the world container so they follow camera pan
 * and zoom automatically.
 */
export class EffectsLayer {
  readonly root: Container;
  private readonly effects: Effect[] = [];
  private lastProcessedTick = -1;

  constructor() {
    this.root = new Container();
  }

  /**
   * Reads `snapshot.events` and spawns new effects.  Skips the snapshot if
   * `currentTick` has not advanced since the last call (exactly-once delivery).
   */
  triggerFromSnapshot(
    snapshot: WorldSnapshot,
    _camera: CameraState,
    _assets: ReadonlyMap<string, LoadedAsset>
  ): void {
    if (snapshot.currentTick <= this.lastProcessedTick) {
      return;
    }
    this.lastProcessedTick = snapshot.currentTick;

    const events = snapshot.events;
    if (events === undefined || events.length === 0) {
      return;
    }

    // Index attack events by attackerId so damage events can look up whether
    // the source was melee or ranged.
    const attackByAttackerId = new Map<
      string,
      AttackMeleeEventSnapshot | AttackRangedEventSnapshot
    >();
    for (const ev of events) {
      if (ev.kind === "attack_melee" || ev.kind === "attack_ranged") {
        attackByAttackerId.set(ev.attackerId, ev);
      }
    }

    for (const ev of events) {
      this.processEvent(ev, attackByAttackerId);
    }
  }

  /** Advances all active effects by `frameDeltaMs` and removes expired ones. */
  updateFrame(frameDeltaMs: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]!;
      effect.elapsed += frameDeltaMs;
      if (effect.elapsed >= effect.duration) {
        this.root.removeChild(effect.gfx);
        effect.gfx.destroy();
        this.effects.splice(i, 1);
      } else {
        applyFrame(effect);
      }
    }
  }

  /** Removes all active effects; call on scene reset. */
  clear(): void {
    for (const effect of this.effects) {
      this.root.removeChild(effect.gfx);
      effect.gfx.destroy();
    }
    this.effects.length = 0;
    this.lastProcessedTick = -1;
  }

  // --- Private helpers ---

  private addEffect(effect: Effect): void {
    // Apply initial state immediately so the effect is correct on the first
    // rendered frame even before updateFrame is called.
    applyFrame(effect);
    this.root.addChild(effect.gfx);
    this.effects.push(effect);
  }

  private processEvent(
    ev: CombatEventSnapshot,
    attackByAttackerId: Map<
      string,
      AttackMeleeEventSnapshot | AttackRangedEventSnapshot
    >
  ): void {
    switch (ev.kind) {
      case "attack_ranged": {
        const src = worldPos(ev.attackerPos);
        const dst = worldPos(ev.targetPos);
        if (ev.unitType === "musketeer") {
          this.addEffect(buildFlash(src.x, src.y));
          this.addEffect(buildSmoke(src.x, src.y));
        } else {
          // Archer (and any other future ranged unit): arrow projectile.
          this.addEffect(buildArrow(src.x, src.y, dst.x, dst.y));
        }
        break;
      }
      case "damage": {
        const attackEv = attackByAttackerId.get(ev.attackerId);
        const color =
          attackEv?.kind === "attack_melee" ? MELEE_SPARK_COLOR : RANGED_SPARK_COLOR;
        const target = worldPos(ev.targetPos);
        this.addEffect(buildSpark(target.x, target.y, ev.attackerId, color));
        break;
      }
      case "building_destroyed": {
        const fp = ev.footprint;
        if (fp.length === 0) break;
        const cx = fp.reduce((s, c) => s + c.x, 0) / fp.length;
        const cy = fp.reduce((s, c) => s + c.y, 0) / fp.length;
        const center = worldPos({ x: cx, y: cy });
        this.addEffect(buildPuff(center.x, center.y));
        break;
      }
      // "attack_melee": hit sparks come via the paired "damage" event.
      // "unit_died": no VFX at this layer (death animation handled by sceneLayer).
      default:
        break;
    }
  }
}
