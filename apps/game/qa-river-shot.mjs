// Visual QA: screenshot river spots on the base map (worktree dev server :5183).
// Usage: node qa-river-shot.mjs <outPrefix> [x,y ...]
import { chromium } from "playwright-core";

const outPrefix = process.argv[2] ?? "/tmp/river-qa";
const spots = process.argv.slice(3).map((s) => {
  const [x, y] = s.split(",").map(Number);
  return { x, y };
});
if (spots.length === 0) {
  spots.push({ x: 2, y: 40 }, { x: 125, y: 42 }, { x: 38, y: 38 });
}

const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});
await page.goto("http://127.0.0.1:5183/", { waitUntil: "load" });
// Scenario select screen: pick free-play (自由演習) for the bare base map.
await page.getByText("自由演習").first().click({ timeout: 30000 });
await page.waitForFunction(() => window.__asamaTest && window.__asamaTest.getSnapshot() != null, null, {
  timeout: 60000
});
await page.waitForTimeout(18000);
const zoomSteps = Number(process.env.QA_ZOOM_STEPS ?? "0");
for (const spot of spots) {
  await page.evaluate((cell) => window.__asamaTest.jumpCameraToCell(cell), spot);
  await page.waitForTimeout(600);
  for (let i = 0; i < zoomSteps; i += 1) {
    await page.mouse.move(800, 450);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1200);
  const path = `${outPrefix}-x${spot.x}-y${spot.y}.png`;
  await page.screenshot({ path });
  console.log("saved", path);
}
await browser.close();
