import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readProductionAssetConfigDir } from "./productionConfig";
import { productionConfigDir, repoRoot } from "./paths";

interface CandidateFamily {
  readonly assetIdPrefix: string;
  readonly reason: string;
}

interface CandidateAsset {
  readonly assetId: string;
  readonly reason: string;
}

interface RuntimeArtQualityConfig {
  readonly version: number;
  readonly candidateFamilies: readonly CandidateFamily[];
  readonly candidateAssets: readonly CandidateAsset[];
}

export interface ProductionArtAuditFinding {
  readonly assetId: string;
  readonly source: string;
  readonly reason: string;
}

const runtimeArtQualityPath = join(repoRoot, "assets/definitions/runtime-art-quality.json");

export async function auditProductionArt(): Promise<readonly ProductionArtAuditFinding[]> {
  const [production, quality] = await Promise.all([
    readProductionAssetConfigDir(productionConfigDir),
    readRuntimeArtQualityConfig()
  ]);

  const exactCandidates = new Map(quality.candidateAssets.map((entry) => [entry.assetId, entry.reason]));
  const findings: ProductionArtAuditFinding[] = [];

  for (const asset of production.assets) {
    const exactReason = exactCandidates.get(asset.assetId);
    const familyReason = quality.candidateFamilies.find((entry) => asset.assetId.startsWith(entry.assetIdPrefix))?.reason;
    const reason = exactReason ?? familyReason;
    if (reason === undefined) {
      continue;
    }

    findings.push({
      assetId: asset.assetId,
      source: asset.source.type === "raster" ? asset.source.file : asset.source.type,
      reason
    });
  }

  return findings;
}

async function readRuntimeArtQualityConfig(): Promise<RuntimeArtQualityConfig> {
  const parsed = JSON.parse(await readFile(runtimeArtQualityPath, "utf8")) as Partial<RuntimeArtQualityConfig>;
  if (parsed.version !== 1 || !Array.isArray(parsed.candidateFamilies) || !Array.isArray(parsed.candidateAssets)) {
    throw new Error(`Invalid runtime art quality config: ${runtimeArtQualityPath}`);
  }
  return parsed as RuntimeArtQualityConfig;
}
