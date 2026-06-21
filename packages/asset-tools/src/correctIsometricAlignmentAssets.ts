import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { repoRoot } from "./paths";

interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface CorrectionTarget {
  readonly label: string;
  readonly dir: string;
  readonly pattern: RegExp;
  readonly anchorY: number;
}

const targets: readonly CorrectionTarget[] = [
  {
    label: "wall",
    dir: join(repoRoot, "assets/source/raster/approved-production/large-directional-wall-gates"),
    pattern: /^building-wall-plaster(?:-connected-[01]{4})?\.png$/,
    anchorY: 80
  },
  {
    label: "fence",
    dir: join(repoRoot, "assets/source/raster/approved-production/mock-removal-fortifications-surfaces"),
    pattern: /^building-fence-wood(?:-connected-[01]{4})?\.png$/,
    anchorY: 48
  }
];

export async function correctIsometricAlignmentAssets(): Promise<string> {
  const reportRows: string[] = [
    "# Isometric Alignment Source Corrections",
    "",
    "| family | file | before bounds | deltaY | after bounds |",
    "| --- | --- | --- | ---: | --- |"
  ];

  for (const target of targets) {
    const files = (await readdir(target.dir)).filter((file) => target.pattern.test(file)).sort();
    for (const file of files) {
      const filePath = join(target.dir, file);
      const { output, before, after, deltaY } = await alignAlphaBottom(filePath, target.anchorY);
      await output.toFile(filePath);
      reportRows.push(
        `| ${target.label} | \`${file}\` | ${formatBounds(before)} | ${deltaY} | ${formatBounds(after)} |`
      );
    }
  }

  const outputDir = join(repoRoot, "artifacts/isometric-alignment");
  await mkdir(outputDir, { recursive: true });
  const reportPath = join(outputDir, "source-correction-report.md");
  await writeFile(reportPath, `${reportRows.join("\n")}\n`, "utf8");
  return reportPath;
}

async function alignAlphaBottom(
  filePath: string,
  anchorY: number
): Promise<{ readonly output: sharp.Sharp; readonly before: AlphaBounds | null; readonly after: AlphaBounds | null; readonly deltaY: number }> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const before = alphaBounds(data, info.width, info.height);
  if (before === null) {
    return { output: sharp(data, { raw: info }).png(), before, after: null, deltaY: 0 };
  }

  const deltaY = anchorY - before.maxY;
  const shifted = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const targetY = y + deltaY;
      if (targetY < 0 || targetY >= info.height) continue;
      const sourceOffset = (y * info.width + x) * 4;
      const targetOffset = (targetY * info.width + x) * 4;
      shifted[targetOffset] = data[sourceOffset] ?? 0;
      shifted[targetOffset + 1] = data[sourceOffset + 1] ?? 0;
      shifted[targetOffset + 2] = data[sourceOffset + 2] ?? 0;
      shifted[targetOffset + 3] = data[sourceOffset + 3] ?? 0;
    }
  }

  return {
    output: sharp(shifted, { raw: info }).png(),
    before,
    after: alphaBounds(shifted, info.width, info.height),
    deltaY
  };
}

function alphaBounds(data: Buffer, width: number, height: number): AlphaBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function formatBounds(bounds: AlphaBounds | null): string {
  return bounds === null ? "-" : `${bounds.minX},${bounds.minY}-${bounds.maxX},${bounds.maxY}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  correctIsometricAlignmentAssets()
    .then((outputPath) => {
      console.log(`Wrote ${outputPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
