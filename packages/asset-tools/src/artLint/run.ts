import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { readManifest } from "../manifest";
import { generatedManifestPath, publicAssetsDir, repoRoot } from "../paths";
import {
  checkBuildingGeometry,
  checkFaceDrift,
  checkInteriorHoles,
  checkMatteFringe,
  checkSpeckles,
  checkTerrainFaceGeometry,
  terrainFaceSide,
  type ArtLintViolation,
  type RawImage
} from "./checks";

/**
 * L1 art lint runner (`assets:lint:art`): applies the machine-checkable rules
 * of docs/05_map-and-art/art-rulebook.md to every manifest asset and animation
 * sheet. Pre-existing violations are recorded in
 * assets/definitions/art-lint-baseline.json for gradual adoption — only
 * violations missing from the baseline fail the gate.
 */

export const artLintBaselinePath = join(repoRoot, "assets/definitions/art-lint-baseline.json");

interface BaselineEntry {
  readonly assetId: string;
  readonly ruleId: string;
}

interface BaselineFile {
  readonly version: number;
  readonly note?: string;
  readonly entries: readonly BaselineEntry[];
}

export interface ArtLintReport {
  readonly checkedAssets: number;
  readonly checkedSheets: number;
  /** Violations not covered by the baseline — these fail the gate. */
  readonly violations: readonly ArtLintViolation[];
  /** Known violations suppressed by the baseline. */
  readonly baselined: readonly ArtLintViolation[];
  /** Baseline entries that no longer match any violation (fixed assets). */
  readonly staleBaseline: readonly string[];
}

async function loadBaseline(): Promise<ReadonlySet<string>> {
  let raw: string;
  try {
    raw = await readFile(artLintBaselinePath, "utf8");
  } catch {
    return new Set();
  }
  const parsed = JSON.parse(raw) as Partial<BaselineFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid art lint baseline: ${artLintBaselinePath}`);
  }
  return new Set(parsed.entries.map((entry) => baselineKey(entry.assetId, entry.ruleId)));
}

function baselineKey(assetId: string, ruleId: string): string {
  return `${ruleId} ${assetId}`;
}

async function loadRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function collectArtLintViolations(): Promise<{
  readonly violations: readonly ArtLintViolation[];
  readonly checkedAssets: number;
  readonly checkedSheets: number;
}> {
  const manifest = await readManifest(generatedManifestPath);
  const violations: ArtLintViolation[] = [];

  for (const asset of manifest.assets) {
    const geo01 = checkBuildingGeometry(asset);
    if (geo01 !== null) {
      violations.push(geo01);
    }
    const geo02 = checkTerrainFaceGeometry(asset);
    if (geo02 !== null) {
      violations.push(geo02);
    }

    const image = await loadRaw(join(publicAssetsDir, asset.file));
    if (terrainFaceSide(asset.assetId) !== null) {
      const geo03 = checkFaceDrift(asset.assetId, image);
      if (geo03 !== null) {
        violations.push(geo03);
      }
    }
    const noise01 = checkSpeckles(asset.assetId, image);
    if (noise01 !== null) {
      violations.push(noise01);
    }
    if (asset.kind === "building") {
      const noise02 = checkMatteFringe(asset.assetId, image);
      if (noise02 !== null) {
        violations.push(noise02);
      }
    }
    const noise03 = checkInteriorHoles(asset.assetId, image);
    if (noise03 !== null) {
      violations.push(noise03);
    }
  }

  const animations = manifest.animations ?? [];
  for (const animation of animations) {
    const image = await loadRaw(join(publicAssetsDir, animation.file));
    const noise01 = checkSpeckles(animation.assetId, image);
    if (noise01 !== null) {
      violations.push(noise01);
    }
  }

  return { violations, checkedAssets: manifest.assets.length, checkedSheets: animations.length };
}

export async function runArtLint(): Promise<ArtLintReport> {
  const [{ violations, checkedAssets, checkedSheets }, baseline] = await Promise.all([
    collectArtLintViolations(),
    loadBaseline()
  ]);

  const fresh: ArtLintViolation[] = [];
  const baselined: ArtLintViolation[] = [];
  const seenKeys = new Set<string>();
  for (const violation of violations) {
    seenKeys.add(baselineKey(violation.assetId, violation.ruleId));
    if (baseline.has(baselineKey(violation.assetId, violation.ruleId))) {
      baselined.push(violation);
    } else {
      fresh.push(violation);
    }
  }
  const staleBaseline = [...baseline].filter((key) => !seenKeys.has(key)).sort();

  return { checkedAssets, checkedSheets, violations: fresh, baselined, staleBaseline };
}

/** Rewrite the baseline so all current violations become known (gate resets to green). */
export async function writeArtLintBaseline(): Promise<number> {
  const { violations } = await collectArtLintViolations();
  const entries = violations
    .map((violation) => ({ assetId: violation.assetId, ruleId: violation.ruleId }))
    .sort((a, b) => (a.ruleId === b.ruleId ? a.assetId.localeCompare(b.assetId) : a.ruleId.localeCompare(b.ruleId)));
  const file: BaselineFile = {
    version: 1,
    note:
      "既知のアートルール違反 (docs/05_map-and-art/art-rulebook.md)。段階導入用: ここに載っている assetId×ruleId は assets:lint:art で fail しない。修正したらエントリを削除すること。再生成: assets:lint:art --write-baseline",
    entries
  };
  await writeFile(artLintBaselinePath, `${JSON.stringify(file, null, 2)}\n`);
  return entries.length;
}
