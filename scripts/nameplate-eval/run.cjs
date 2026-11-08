// Scores the device nameplate scanner against labeled photos.
//
//   npx vite build --config scripts/nameplate-eval/vite.config.mjs
//   node scripts/nameplate-eval/run.cjs <folder> [--text]
//
// The folder holds plate photos (plate.jpg) with expected values beside them
// (plate.json, using the nameplate field keys, e.g. {"model": "4TTV7X48A1000AA"}).
// Fields absent from the JSON are not scored. Keep customer photos out of the repo.
// OCR assets download from the CDN on first use.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DIST = path.join(__dirname, "dist", "eval.js");
const folder = process.argv[2];
const showText = process.argv.includes("--text");
if (!folder) { console.error("Usage: node scripts/nameplate-eval/run.cjs <folder> [--text]"); process.exit(1); }
if (!fs.existsSync(DIST)) { console.error("Build first: npx vite build --config scripts/nameplate-eval/vite.config.mjs"); process.exit(1); }

const images = fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const norm = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.route("http://nameplate-eval.test/**", (route) => {
    const isScript = route.request().url().endsWith("/eval.js");
    route.fulfill(isScript
      ? { body: fs.readFileSync(DIST), contentType: "text/javascript" }
      : { body: '<!doctype html><meta charset="utf-8"><input type="file" id="f"><script src="eval.js"></script>', contentType: "text/html" });
  });
  await page.goto("http://nameplate-eval.test/");
  let right = 0, wrong = 0, missing = 0;
  for (const image of images) {
    const truthFile = path.join(folder, image.replace(/\.[^.]+$/, ".json"));
    const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, "utf8")) : {};
    await page.setInputFiles("#f", path.join(folder, image));
    const r = await page.evaluate(() => window.runPlate(document.getElementById("f").files[0]));
    const rows = Object.keys(truth).map((key) => {
      const got = r.fields[key] ?? "";
      const status = !got ? "missing" : norm(got) === norm(truth[key]) ? "ok" : "WRONG";
      if (status === "ok") right += 1; else if (status === "WRONG") wrong += 1; else missing += 1;
      return `  ${status.padEnd(7)} ${key.padEnd(17)} got "${got}"${status === "ok" ? "" : ` expected "${truth[key]}"`}`;
    });
    console.log(`\n${image} (${r.ms} ms)${Object.keys(truth).length ? "" : " — no .json, showing fields only"}`);
    if (rows.length) console.log(rows.join("\n")); else console.log(JSON.stringify(r.fields, null, 1));
    if (r.conflicts.length) console.log(`  conflicts: ${r.conflicts.join(", ")}`);
    for (const check of r.checks) console.log(`  check: ${check}`);
    if (showText) r.passes.forEach((text, i) => console.log(`  --- pass ${i + 1}\n${text}`));
  }
  const scored = right + wrong + missing;
  if (scored) console.log(`\nTotal: ${right}/${scored} correct, ${wrong} wrong, ${missing} missing`);
  await browser.close();
})();
