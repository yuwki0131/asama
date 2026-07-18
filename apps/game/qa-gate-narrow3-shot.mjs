// Visual QA: narrow 3-cell gate (gate_narrow_3 / gate_narrow_3_ne_sw).
// Finds an empty flat region in free-play, builds a wall line with two narrow
// gates (one open, one closed) plus a NE-SW narrow gate, and captures:
//   /tmp/gate-narrow3-game.png      (wall-line composition)
//   /tmp/gate-narrow3-openclose.png (open vs closed, zoomed)
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});
await page.goto("http://127.0.0.1:5194/", { waitUntil: "domcontentloaded" });
await page.getByText("自由演習").first().click({ timeout: 30000 });
await page.waitForFunction(() => window.__asamaTest && window.__asamaTest.getSnapshot() != null, null, {
  timeout: 60000
});
await page.waitForTimeout(12000);

// Hide the debug status panel / overlay for clean shots.
try {
  await page.getByRole("button", { name: "Debug" }).click({ timeout: 5000 });
} catch {
  // fine if absent
}

const origin = await page.evaluate(() => {
  const t = window.__asamaTest;
  const snap = t.getSnapshot();
  const occupied = new Set();
  for (const b of snap.buildings) {
    for (const c of b.footprint ?? [b.position]) occupied.add(`${c.x},${c.y}`);
  }
  const boxFree = (ox, oy, w, h) => {
    for (let y = oy; y < oy + h; y += 1) {
      for (let x = ox; x < ox + w; x += 1) {
        if (occupied.has(`${x},${y}`)) return false;
      }
    }
    return true;
  };
  const candidates = [];
  for (let oy = 16; oy <= 100; oy += 4) {
    if (oy >= 34 && oy <= 48) continue; // river band
    for (let ox = 16; ox <= 96; ox += 4) {
      candidates.push([ox, oy]);
    }
  }
  for (const [ox, oy] of candidates) {
    if (boxFree(ox - 2, oy - 2, 24, 18)) return { x: ox, y: oy };
  }
  return null;
});
console.log("origin:", JSON.stringify(origin));
if (origin == null) {
  console.log("no free region found");
  process.exit(1);
}

await page.evaluate((o) => {
  const t = window.__asamaTest;
  const tick = t.getSnapshot()?.currentTick ?? 0;
  let seq = 1;
  const cmd = (c) => t.enqueue({ ...c, issuedAtTick: tick, clientSequence: seq++ });
  const y = o.y;
  for (let x = o.x; x <= o.x + 2; x += 1) cmd({ type: "placeBuilding", buildingType: "wall", position: { x, y } });
  cmd({ type: "placeBuilding", buildingType: "gate_narrow_3", position: { x: o.x + 3, y } });
  for (let x = o.x + 6; x <= o.x + 8; x += 1) cmd({ type: "placeBuilding", buildingType: "wall", position: { x, y } });
  cmd({ type: "placeBuilding", buildingType: "gate_narrow_3", position: { x: o.x + 9, y } });
  for (let x = o.x + 12; x <= o.x + 14; x += 1) cmd({ type: "placeBuilding", buildingType: "wall", position: { x, y } });
  // NE-SW narrow gate in a vertical wall stretch below
  for (let yy = o.y + 3; yy <= o.y + 4; yy += 1) cmd({ type: "placeBuilding", buildingType: "wall", position: { x: o.x, y: yy } });
  cmd({ type: "placeBuilding", buildingType: "gate_narrow_3_ne_sw", position: { x: o.x, y: o.y + 5 } });
  for (let yy = o.y + 9; yy <= o.y + 10; yy += 1) cmd({ type: "placeBuilding", buildingType: "wall", position: { x: o.x, y: yy } });
}, origin);
await page.waitForTimeout(3000);

// Close the right nw_se gate (center = origin.x+10, origin.y)
await page.evaluate((o) => {
  const t = window.__asamaTest;
  const tick = t.getSnapshot()?.currentTick ?? 0;
  t.enqueue({ type: "toggleGate", position: { x: o.x + 10, y: o.y }, issuedAtTick: tick, clientSequence: 999 });
}, origin);
await page.waitForTimeout(3000);

const gates = await page.evaluate(() =>
  window.__asamaTest
    .getSnapshot()
    .buildings.filter((b) => b.type.startsWith("gate_narrow"))
    .map((g) => `${g.type}@${g.position.x},${g.position.y} state=${g.gateState} asset=${g.assetId}`)
);
console.log(gates.length === 0 ? "NO NARROW GATES PLACED" : gates.join("\n"));

// Shot 1: wall line with gates
await page.evaluate((o) => window.__asamaTest.jumpCameraToCell({ x: o.x + 7, y: o.y + 4 }), origin);
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/gate-narrow3-game.png" });
console.log("saved /tmp/gate-narrow3-game.png");

// Shot 2: open vs closed comparison — zoom into the two nw_se gates
await page.evaluate((o) => window.__asamaTest.jumpCameraToCell({ x: o.x + 7, y: o.y }), origin);
await page.waitForTimeout(800);
for (let i = 0; i < 3; i += 1) {
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/gate-narrow3-openclose.png" });
console.log("saved /tmp/gate-narrow3-openclose.png");

await browser.close();
