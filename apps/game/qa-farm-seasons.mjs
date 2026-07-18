// Visual QA: screenshot the free-play farms in all four seasons.
// Usage: [ASAMA_QA_PORT=5182] node qa-farm-seasons.mjs [outPrefix]
import { chromium } from "playwright-core";

const outPrefix = process.argv[2] ?? "/tmp/farm-refine";
const port = process.env.ASAMA_QA_PORT ?? "5182";

const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
// Scenario select screen: free-play (自由演習) starts with 4 farms in the castle town.
await page.getByText("自由演習").first().click({ timeout: 30000 });
await page.waitForFunction(() => window.__asamaTest && window.__asamaTest.getSnapshot() != null, null, {
  timeout: 60000
});
await page.waitForTimeout(18000);

const farm = await page.evaluate(() => {
  const snap = window.__asamaTest.getSnapshot();
  const f = snap.buildings.find((b) => b.type === "farm");
  return f ? f.position : null;
});
console.log("farm at", farm);
const target = farm ?? { x: 50, y: 96 };

for (const season of ["spring", "summer", "autumn", "winter"]) {
  await page.evaluate((s) => window.__asamaTest.setSeason(s), season);
  await page.evaluate((cell) => window.__asamaTest.jumpCameraToCell(cell), target);
  await page.waitForTimeout(600);
  // jumpCameraToCell resets zoom to 1 -> wheel up to ~2x.
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(800, 450);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  const path = `${outPrefix}-${season}.png`;
  await page.screenshot({ path });
  console.log("saved", path);
}
await browser.close();
