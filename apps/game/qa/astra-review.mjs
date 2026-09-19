#!/usr/bin/env node
// Astra review — heterogeneous VLM reviewer for the visual-patrol cycle (L2).
// The in-house L2 reviewers are Claude-family agents; same-family reviewers can
// share blind spots. This tool sends patrol captures to OpenAI GPT-6 Astra via
// the local `codex exec` CLI (ChatGPT login, no API key) for an independent
// open-ended 違和感 extraction, mirroring the fresh-context reviewer contract
// (no rulebook priming, per-finding position/what/severity).
//
// Usage:
//   node qa/astra-review.mjs --run-dir artifacts/visual-patrol/<scenario>/<run>
//     [--model gpt-6-astra] [--concurrency 3] [--shots p01,p03]
//
// Requires: `codex` on PATH with an active login (`codex login status`).
// Output: <run-dir>/astra-review.json + astra-review.md (per-shot findings).
// index.json in the run dir supplies cell/zoom metadata per shot.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const SHOT_TIMEOUT_MS = 300_000;

// stdin must be closed ("ignore"): with an open pipe codex waits for
// "additional input from stdin" until the timeout kills it. execFile cannot
// close stdin, hence spawn.
function runCodex(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("codex", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`codex exec timed out after ${SHOT_TIMEOUT_MS / 1000}s`));
    }, SHOT_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(undefined);
      else reject(new Error(`codex exec exited ${code} — ${stderr.slice(-400)}`));
    });
  });
}

const REVIEW_PROMPT = [
  "あなたは2Dアイソメトリック調ゲーム画面の品質検査員です。",
  "添付のスクリーンショットを先入観なしに観察し、ゲーム画面として違和感のある箇所を全て挙げてください。",
  "反復・コピペ感、接合部や端の破綻、描画順の異常、色調やライティングの不整合、その他「何かおかしい」と感じる点を漏らさず報告してください。",
  "対象はマップ描画のみ。画面上部のツールバー・左上のHUD・右下のミニマップ等のUIオーバーレイは審査対象外です。",
  "各指摘は次の形式で1行ずつ:",
  "位置(画像内のおおよその場所) | 何が変か(具体的に) | 深刻度(高/中/低)",
  "深刻度の基準: 高=一目で没入を壊す、中=注視すると気になる、低=言われれば分かる程度。",
  "違和感が本当に無ければ「指摘なし」とだけ答えてください。"
].join("\n");

function parseArgs(argv) {
  const options = {
    runDir: null,
    model: "gpt-6-astra",
    concurrency: 3,
    shots: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    if (arg === "--run-dir") options.runDir = resolve(next());
    else if (arg === "--model") options.model = next();
    else if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--shots") options.shots = next().split(",").map((s) => s.trim());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.runDir) throw new Error("--run-dir is required");
  return options;
}

async function reviewShot(model, shotPath, meta, workDir) {
  const outPath = join(workDir, `${basename(shotPath, ".png")}.last.md`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await runCodex([
        "exec",
        "-m", model,
        "--skip-git-repo-check",
        "-s", "read-only",
        "-i", shotPath,
        "-o", outPath,
        REVIEW_PROMPT
      ]);
      const review = (await readFile(outPath, "utf8")).trim();
      if (!review) throw new Error("empty response");
      return { shot: basename(shotPath), meta, review };
    } catch (error) {
      if (attempt >= 3) {
        throw new Error(`${basename(shotPath)}: codex exec failed after ${attempt} attempts — ${error.message}`);
      }
      await new Promise((r) => setTimeout(r, attempt * 10_000));
    }
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let index = {};
  try {
    index = JSON.parse(await readFile(join(options.runDir, "index.json"), "utf8"));
  } catch {
    console.warn("index.json not found in run dir — proceeding without cell/zoom metadata");
  }
  const metaByShot = new Map((index.views ?? []).map((view) => [view.file, view]));

  const files = (await readdir(options.runDir))
    .filter((name) => /^(first|p\d+).*\.png$/.test(name))
    .filter((name) => !options.shots || options.shots.some((s) => name.startsWith(s)))
    .sort();
  if (files.length === 0) throw new Error(`No p*.png shots found in ${options.runDir}`);

  const workDir = await mkdtemp(join(tmpdir(), "astra-review-"));
  console.log(`astra-review: ${files.length} shots → ${options.model} (via codex exec)`);
  try {
    const results = await runPool(files, options.concurrency, async (name) => {
      const result = await reviewShot(
        options.model,
        join(options.runDir, name),
        metaByShot.get(name) ?? null,
        workDir
      );
      console.log(`  reviewed ${name}`);
      return result;
    });

    const jsonPath = join(options.runDir, "astra-review.json");
    await writeFile(
      jsonPath,
      JSON.stringify({ model: options.model, reviewedAt: new Date().toISOString(), results }, null, 2)
    );

    const md = [
      `# Astra review (${options.model})`,
      "",
      `run: ${options.runDir}`,
      "",
      ...results.flatMap((r) => [
        `## ${r.shot}${r.meta?.cell ? ` — cell=(${r.meta.cell.x},${r.meta.cell.y}) zoom=${r.meta.zoom}` : ""}`,
        "",
        r.review,
        ""
      ])
    ].join("\n");
    const mdPath = join(options.runDir, "astra-review.md");
    await writeFile(mdPath, md);
    console.log(`astra-review: wrote ${jsonPath} and ${mdPath}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
