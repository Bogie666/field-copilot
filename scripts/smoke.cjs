// Browser smoke test for the job flow. No AI calls: /api/explain is intercepted.
//
//   npm run build && FIELD_COPILOT_AUTH_ENABLED=false npx next start -p 3037 &
//   COPILOT_URL=http://127.0.0.1:3037 npm run smoke
//
// CHROMIUM_PATH overrides the browser binary (defaults to the sandbox's pre-installed Chromium).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright-core");

const BASE = process.env.COPILOT_URL || "http://127.0.0.1:3037";
const EXECUTABLE = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const NOTE =
  "We found a documented airflow concern during the inspection. The recorded pressure was above the comparison supplied for this equipment, which supports the finding rather than identifying a separate cause. The recommended next step is to review the return airflow and repeat the documented test after approved work. This estimate describes that recommendation; any additional options need to be reviewed separately before approval. The available findings do not establish a specific savings amount or a guaranteed result.";

async function noOverflow(page, label) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const offenders = await page.evaluate(() =>
      document.documentElement.scrollWidth > innerWidth
        ? [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className || ""} "${(el.textContent || "").slice(0, 40)}"`)
        : [],
    );
    assert.deepEqual(offenders, [], `horizontal overflow at ${width}px on ${label}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let sent = null;
  await page.route("**/api/explain", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, provider: "mock-only", note: NOTE, techNote: "PRIVATE check the readings" } });
  });

  try {
    // 1. Start a job
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Start a job" }).waitFor();
    await page.getByLabel("Job label (optional)").fill("Smoke test, 12 Oak Lane");
    await page.getByRole("button", { name: "Start job" }).click();
    await page.getByRole("heading", { name: "What are we working on?" }).waitFor();
    const jobUrl = page.url();
    for (const tile of ["Condenser", "Furnace or air handler", "Attic and ductwork", "Whole home"]) {
      await page.getByRole("link", { name: new RegExp(tile) }).waitFor();
    }
    await noOverflow(page, "job home");
    console.log("PASS start job and tile grid");

    // 2. Electrical: blank start, concern result, save
    await page.getByRole("link", { name: /Condenser/ }).click();
    await page.getByRole("link", { name: /Electrical readings/ }).click();
    assert.equal(await page.getByLabel("Line voltage (V)").inputValue(), "", "inputs start blank");
    assert.equal(await page.getByRole("button", { name: /Save finding/ }).count(), 0, "no save before a result");
    await page.getByLabel("Nominal voltage (V)").fill("240");
    await page.getByLabel("Line voltage (V)").fill("238");
    await page.getByLabel("Compressor RLA (A)").fill("12.3");
    await page.getByLabel("Compressor amps (A)").fill("13.4");
    await page.getByRole("heading", { name: "Result" }).waitFor();
    await page.getByRole("button", { name: "Save finding" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    await noOverflow(page, "electrical tool");
    console.log("PASS electrical result and save");

    await page.waitForTimeout(300); // let the IndexedDB write finish before reloading
    // 3. Reload: finding persists (IndexedDB) and the form reopens with its inputs
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByLabel("Compressor amps (A)").inputValue(), "13.4", "saved inputs reopen");
    await page.goBack();
    await page.getByText(/Needs attention/).first().waitFor();
    console.log("PASS persistence across reload");

    // 4. Charge tool: provisional notice, computed values
    await page.getByRole("link", { name: /Refrigerant charge/ }).click();
    await page.getByText("Provisional pressure-temperature data").waitFor();
    await page.getByLabel("Refrigerant").selectOption("R-410A");
    await page.getByLabel("Metering device").selectOption("txv");
    await page.getByLabel("Suction pressure (psig)").fill("118");
    await page.getByLabel("Suction line temp (F)").fill("52");
    await page.getByLabel("Liquid pressure (psig)").fill("418");
    await page.getByLabel("Liquid line temp (F)").fill("110");
    await page.getByLabel("Manufacturer target (F subcooling)").fill("10");
    await page.getByLabel("Allowed tolerance (plus or minus F)").fill("2");
    await page.getByText(/Superheat 12/).first().waitFor();
    await page.getByRole("button", { name: "Save finding" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    console.log("PASS charge tool computes and saves");

    // 5. Furnace: safety path needs a safety action and a photo
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Furnace or air handler/ }).click();
    await page.getByRole("link", { name: /Furnace check/ }).click();
    await page.getByLabel("Return air (F)").fill("68");
    await page.getByLabel("Supply air (F)").fill("123");
    await page.getByLabel("Rise range low (F)").fill("35");
    await page.getByLabel("Rise range high (F)").fill("65");
    await page.getByLabel("Cracked or perforated heat exchanger").check();
    await page.getByRole("heading", { name: "Safety condition" }).waitFor();
    const saveButton = page.getByRole("button", { name: "Save finding" });
    assert.equal(await saveButton.isDisabled(), true, "safety finding blocked without action and photo");
    await page.getByLabel("Safety action taken").fill("Shut down and tagged the furnace.");
    assert.equal(await saveButton.isDisabled(), true, "still blocked without a photo");
    // A real 1x1 PNG stands in for a camera photo.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.locator('input[type="file"]').setInputFiles({ name: "plate.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: /Save finding/ }).waitFor();
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Save finding/.test(x.textContent || ""));
      return b && !b.disabled;
    }, null, { timeout: 8000 });
    await page.getByRole("button", { name: "Save finding" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    console.log("PASS furnace safety gating (action and photo required)");

    // 6. Home shows safety status
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Furnace or air handler: Safety finding/ }).waitFor();

    // 7. Summary: safety first, compose payload has exactly six keys and no job label
    await page.getByRole("link", { name: /Summary and customer note/ }).click();
    await page.getByRole("heading", { name: "Summary", exact: true }).waitFor();
    const headings = await page.locator("section[aria-label='System 1'] li strong").allTextContents();
    assert.equal(headings[0], "Safety condition observed", "safety finding is listed first");
    await page.getByRole("button", { name: "Generate estimate note" }).click();
    await page.getByLabel("Customer estimate note").waitFor();
    await page.waitForFunction(() => document.querySelector("#customer-note")?.value.length > 0);
    assert.deepEqual(Object.keys(sent).sort(), ["diagnosis", "equipmentAge", "equipmentType", "readings", "recommendation", "urgency"]);
    assert.equal(sent.urgency, "urgent safety concern");
    assert.ok(!JSON.stringify(sent).includes("Oak Lane"), "job label must never be sent");
    assert.match(sent.recommendation, /Safety action: Shut down and tagged the furnace\./);
    const copy = page.getByRole("button", { name: "Copy customer note", exact: true });
    assert.equal(await copy.isDisabled(), true, "review required before copy");
    await page.getByLabel(/I reviewed this customer note/).check();
    assert.equal(await copy.isDisabled(), false);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.copiedNote = t; } } }));
    await copy.click();
    await page.waitForFunction(() => !!window.copiedNote);
    assert.equal(await page.evaluate(() => window.copiedNote), NOTE);
    assert.ok(!(await page.evaluate(() => window.copiedNote)).includes("PRIVATE"));
    // Deselecting a finding makes the draft stale and blocks copy
    await page.locator("section[aria-label='System 1'] input[type=checkbox]").nth(1).uncheck();
    assert.equal(await copy.isDisabled(), true, "changed selection makes the draft stale");
    await noOverflow(page, "summary");
    console.log("PASS summary ordering, six-key payload, no label leak, review-gated copy, stale on change");

    // 7b. Ported tools: airflow save, nameplate extras, notes persistence
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Furnace or air handler/ }).click();
    await page.getByRole("link", { name: /Nameplate scan/ }).click();
    await page.getByLabel("Temperature rise range (F, for example 35-65)").fill("35-65");
    await page.getByLabel("Max external static (in. w.c.)").fill("0.5");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    await page.goBack();
    await page.getByRole("link", { name: /Airflow/ }).click();
    await page.getByLabel("Method").selectOption("flow-hood");
    await page.getByLabel("System tonnage (tons)").fill("3");
    await page.getByLabel("Airflow reading 1 (CFM)").fill("1200");
    await page.getByText(/400/).first().waitFor();
    await page.getByRole("button", { name: "Save finding" }).click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    await page.goBack();
    await page.getByRole("link", { name: /Voice notes/ }).click();
    await page.getByLabel("Notes", { exact: true }).fill("Customer reports uneven cooling upstairs.");
    await page.getByText("Saved to this job").waitFor();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByLabel("Notes", { exact: true }).inputValue(), "Customer reports uneven cooling upstairs.");
    await noOverflow(page, "notes tool");
    console.log("PASS nameplate extras, airflow save, notes persistence");

    // 7c. Insulation vermiculite is a safety finding that needs an action and a photo
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /Attic and ductwork/ }).click();
    await page.getByRole("link", { name: /Attic insulation/ }).click();
    await page.getByLabel("Suspected vermiculite (possible asbestos)").check();
    await page.getByLabel("Depth reading 1 (in)").fill("5");
    await page.getByLabel("Climate zone").selectOption("3");
    await page.getByRole("heading", { name: "Safety condition" }).waitFor().catch(() => undefined);
    const insulationSave = page.getByRole("button", { name: /Save finding/ });
    assert.equal(await insulationSave.isDisabled(), true, "insulation safety finding is blocked without action and photo");
    console.log("PASS insulation safety gating");

    // 8. Standalone tools do not save
    await page.goto(`${BASE}/tools`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Tools" }).waitFor();
    await page.goto(`${BASE}/tools/explain`, { waitUntil: "networkidle" });
    await page.getByLabel("Finding").fill("Return static pressure measured above the rated value.");
    await page.getByRole("button", { name: "Generate estimate note" }).waitFor();

    assert.deepEqual(errors, []);
    console.log("ALL PASS");
  } catch (error) {
    await page.screenshot({ path: "/tmp/smoke-failure.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
