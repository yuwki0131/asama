import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import Fastify from "fastify";

const gzipAsync = promisify(gzip);
const rootDir = resolve(process.cwd(), "../..");
const savesDir = join(rootDir, "saves");
const publicDir = join(rootDir, "public");
const server = Fastify({ logger: true });

server.get("/api/content/index", async () => ({
  contentVersion: "0.0.0",
  types: ["units", "buildings", "terrain", "scenarios"]
}));

server.get("/api/saves", async () => {
  await ensureSaveDirs();
  const groups = await Promise.all(["manual", "autosave", "quicksave"].map(async (group) => ({
    group,
    files: await readdir(join(savesDir, group))
  })));
  return { groups };
});

server.get<{ Params: { saveId: string } }>("/api/saves/:saveId", async (request, reply) => {
  const path = safeSavePath("manual", request.params.saveId);
  return reply.type("application/octet-stream").send(createReadStream(path));
});

server.post<{ Body: { saveId: string; data: unknown } }>("/api/saves", async (request) => {
  await ensureSaveDirs();
  const path = safeSavePath("manual", request.body.saveId);
  const tmpPath = `${path}.tmp`;
  const payload = await gzipAsync(JSON.stringify(request.body.data));
  await writeFile(tmpPath, payload);
  await readFile(tmpPath);
  await rename(tmpPath, path);
  return { ok: true };
});

server.delete<{ Params: { saveId: string } }>("/api/saves/:saveId", async (request) => {
  await rm(safeSavePath("manual", request.params.saveId), { force: true });
  return { ok: true };
});

server.get<{ Params: { "*": string } }>("/assets/*", async (request, reply) => {
  const assetPath = resolve(publicDir, "assets", request.params["*"]);
  if (!assetPath.startsWith(resolve(publicDir, "assets"))) {
    return reply.code(400).send({ error: "Invalid asset path" });
  }
  return reply.send(createReadStream(assetPath));
});

await ensureSaveDirs();
await server.listen({ host: "127.0.0.1", port: 3000 });

async function ensureSaveDirs(): Promise<void> {
  await Promise.all([
    mkdir(join(savesDir, "manual"), { recursive: true }),
    mkdir(join(savesDir, "autosave"), { recursive: true }),
    mkdir(join(savesDir, "quicksave"), { recursive: true })
  ]);
}

function safeSavePath(group: "manual" | "autosave" | "quicksave", saveId: string): string {
  const fileName = basename(saveId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(savesDir, group, fileName.endsWith(".jcastle") ? fileName : `${fileName}.jcastle`);
}
