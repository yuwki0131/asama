// Visual QA: screenshot the tenshu in 五段積の城 (worktree dev server).
// Usage: ASAMA_QA_PORT=5192 node qa-tenshu-shot.mjs <outPath> [dx,dy offset from tenshu]
import { chromium } from "playwright-core";

const outPath = process.argv[2] ?? "/tmp/tenshu-qa.png";
const [dx, dy] = (process.argv[3] ?? "1,-2").split(",").map(Number);
const port = process.env.ASAMA_QA_PORT ?? "5185";

const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text(), m.location().url);
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.getByText("五段積の城").first().click({ timeout: 30000 });
await page.waitForFunction(() => window.__asamaTest && window.__asamaTest.getSnapshot() != null, null, {
  timeout: 60000
});
await page.waitForTimeout(18000);
const tenshu = await page.evaluate(() => {
  const snap = window.__asamaTest.getSnapshot();
  const found = snap.buildings.find((b) => b.type === "tenshu");
  return found ? found.position : null;
});
console.log("tenshu position", tenshu);
const cell = tenshu ? { x: tenshu.x + dx, y: tenshu.y + dy } : { x: 52 + dx, y: 54 + dy };
await page.evaluate((c) => window.__asamaTest.jumpCameraToCell(c), cell);
await page.waitForTimeout(1500);
await page.screenshot({ path: outPath });
console.log("saved", outPath);
await browser.close();
