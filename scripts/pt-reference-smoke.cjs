// Published PT chart browser regression. AI is intercepted; no paid model call.
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const BASE = process.env.COPILOT_URL || "http://127.0.0.1:3000";
const EXECUTABLE = process.env.CHROMIUM_PATH;
const CASES = [
  { id: "R-410A", suction: "118.1", suctionLine: "50.0", liquid: "416.9", liquidLine: "110.0", publisher: "Honeywell" },
  { id: "R-22", suction: "68.6", suctionLine: "50.0", liquid: "260.0", liquidLine: "110.0", publisher: "Honeywell" },
  { id: "R-32", suction: "121.0", suctionLine: "50.0", liquid: "325.7", liquidLine: "90.0", publisher: "iGas" },
  { id: "R-454B", suction: "120", suctionLine: "56.0", liquid: "400", liquidLine: "110.8", publisher: "Chemours" },
  { id: "R-454B", suction: "120", suctionLine: "56.0", liquid: "696.2", liquidLine: "156.0", publisher: "Chemours" },
];
const NOTE = "We recorded the refrigerant pressures and line temperatures during this inspection. Superheat, the difference between the suction line temperature and the refrigerant's saturation temperature, and subcooling, the difference between the liquid saturation temperature and liquid line temperature, were calculated from those readings. The pressure-temperature reference still requires technical approval, so this comparison should be verified against the manufacturer's chart before relying on it. The recommended next step is to confirm the readings and the equipment-specific charging target. These findings do not establish a cause or a final outcome.";
async function enter(page, c) {
  await page.getByLabel("Refrigerant", { exact: true }).selectOption(c.id);
  await page.getByLabel("Metering device").selectOption("txv");
  await page.getByLabel("Suction pressure (psig)").fill(c.suction);
  await page.getByLabel("Suction line temp (F)").fill(c.suctionLine);
  await page.getByLabel("Liquid pressure (psig)").fill(c.liquid);
  await page.getByLabel("Liquid line temp (F)").fill(c.liquidLine);
  await page.getByLabel("Manufacturer target (F subcooling)").fill("10");
  await page.getByLabel("Allowed tolerance (plus or minus F)").fill("2");
  await page.getByRole("heading", { name: "Result", exact: true }).waitFor();
  const text = await page.locator("body").innerText();
  assert.ok(text.includes(c.publisher), `${c.id} must show selected chart publisher ${c.publisher}`);
  await page.getByText(/^Superheat 10 F \(/).first().waitFor();
  await page.getByText(/^Subcooling 10 F \(/).first().waitFor();
  assert.match(text, /[Pp]rovisional|technical approval|not approved/, "technical approval safeguard must remain");
  assert.ok(!text.includes("not a manufacturer chart"), "obsolete CoolProp-only copy must be removed");
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: ["--no-sandbox"] });
  try {
    for (const c of CASES) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/tools/charge`, { waitUntil: "networkidle" });
      await enter(page, c);
      for (const theme of ["light", "dark"]) {
        if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${c.id} ${theme} overflow at ${width}px`);
        }
        if (c.id === "R-454B" && c.liquid === "400") {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: `/tmp/field-copilot-pt-${theme}.png`, fullPage: true });
        }
      }
      console.log(`PASS ${c.id}: published source and exact chart-backed superheat/subcooling at ${c.liquid} psig`);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", e => pageErrors.push(e.message));
    let sent = null;
    await page.route("**/api/explain", async route => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, provider: "mock-only", note: NOTE, techNote: "Synthetic browser test; review source." } });
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByLabel("Job label (optional)").fill("PT source browser regression");
    await page.getByRole("button", { name: "Start job", exact: true }).click();
    await page.getByRole("heading", { name: "What are we working on?" }).waitFor();
    const jobUrl = page.url();
    await page.getByRole("link", { name: /Condenser/ }).click();
    await page.getByRole("link", { name: /Refrigerant charge/ }).click();
    await enter(page, CASES[3]);
    await page.getByLabel("Recommended next step (optional)").fill("Confirm readings against the manufacturer chart and equipment charging target.");
    await page.getByRole("button", { name: "Save finding", exact: true }).click();
    await page.getByRole("button", { name: "Saved", exact: true }).waitFor();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByLabel("Refrigerant", { exact: true }).inputValue(), "R-454B");
    await page.getByRole("button", { name: "Saved", exact: true }).waitFor();
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Summary and customer note/ }).click();
    await page.getByRole("heading", { name: "Summary", exact: true }).waitFor();
    await page.getByText("Readings", { exact: true }).click();
    const text = await page.locator("body").innerText();
    assert.match(text, /Chemours/, "source must persist in saved finding");
    assert.match(text, /[Pp]rovisional|not approved/, "provisional classification must persist");
    const checkbox = page.locator("section[aria-label='System 1'] li input[type=checkbox]").first();
    if (!(await checkbox.isChecked())) await checkbox.check();
    await page.getByText("What will be sent", { exact: true }).click();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `expanded source preview overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Generate estimate note", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#customer-note")?.value.length > 0);
    assert.ok(sent, "mock API must receive composed data");
    assert.match(sent.readings, /Chemours/, "selected source must reach AI input");
    assert.match(sent.diagnosis, /[Pp]rovisional|not approved/, "approval caution must reach AI input");
    assert.ok(!JSON.stringify(sent).includes("PT source browser regression"), "job label must remain private");
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: "/tmp/field-copilot-pt-summary.png", fullPage: true });
    await context.close();
    console.log("PASS source survives saving/reloading/summary and mocked AI composition; no paid model calls");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
