const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const BASE = process.env.COPILOT_URL || 'http://127.0.0.1:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH;

async function noOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(result.scrollWidth <= result.width, `${label} overflows: ${result.scrollWidth}px at ${result.width}px`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  await context.addInitScript(() => {
    window.__recognitionStarted = false;
    window.SpeechRecognition = class {
      constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.onresult = null; this.onend = null; this.onerror = null; }
      start() { window.__recognitionStarted = true; }
      stop() { if (this.onend) this.onend(); }
    };
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Jobs', exact: true }).waitFor();
    assert.equal(await page.locator('.bottomNavLink').count(), 4);
    assert.equal(await page.locator('.bottomNav').evaluate(el => getComputedStyle(el).position), 'fixed');
    await noOverflow(page, 'jobs');

    await page.getByRole('link', { name: 'Notes', exact: true }).click();
    await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();
    await noOverflow(page, 'notes list');
    await page.getByRole('link', { name: '+ New', exact: true }).click();
    await page.waitForURL(/\/notes\/new$/);
    assert.equal(await page.locator('.bottomNav').count(), 0, 'notepad must hide primary tabs');
    await page.getByLabel('Note title').fill('Compressor follow-up');
    await page.getByLabel('Personal note').fill('Check the compressor sound on the return visit.');
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    const canvas = page.getByLabel('Drawing layer');
    const box = await canvas.boundingBox();
    assert.ok(box, 'drawing canvas must be visible');
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 90);
    await page.mouse.up();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByText('Compressor follow-up', { exact: true }).waitFor();
    await page.getByPlaceholder('Search notes').fill('compressor');
    assert.equal(await page.getByText('Compressor follow-up', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Pin Compressor follow-up', exact: true }).click();
    await page.getByRole('heading', { name: 'Pinned', exact: true }).waitFor();
    await page.getByRole('link', { name: /Compressor follow-up/ }).click();
    await page.waitForURL(/\/notes\/note-/);
    await page.getByLabel('Personal note', { exact: true }).fill('Latest edit must survive an immediate reload.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Personal note', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Personal note', { exact: true }).inputValue(), 'Latest edit must survive an immediate reload.');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor();

    await page.getByRole('link', { name: 'Quick dictate a personal note', exact: true }).click();
    await page.waitForURL(/\/notes\/new\?dictate=1$/);
    await page.waitForFunction(() => window.__recognitionStarted === true);
    await page.getByRole('button', { name: 'Close note', exact: true }).click();

    await page.getByRole('link', { name: 'Tools', exact: true }).click();
    await page.getByRole('heading', { name: 'Tools', exact: true }).waitFor();
    await page.getByRole('link', { name: /Refrigerant charge/ }).waitFor();
    await noOverflow(page, 'tools');

    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    await page.getByRole('heading', { name: 'Photos', exact: true }).waitFor();
    await page.getByText('No job photos yet', { exact: true }).waitFor();
    await noOverflow(page, 'photos');

    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await page.getByLabel('Job label (optional)').fill('Nocturne browser QA');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('heading', { name: 'Nocturne browser QA', exact: true }).waitFor();
    await page.getByRole('link', { name: /Summary & customer note/ }).waitFor();
    await noOverflow(page, 'job home');
    await page.getByRole('link', { name: /Condenser/ }).click();
    await page.getByRole('link', { name: /Job notes/ }).waitFor();
    await noOverflow(page, 'component tools');

    assert.deepEqual(pageErrors, []);
    console.log('PASS Nocturne shell, fixed tabs, personal notes, drawing, quick dictation, tools, photos and job navigation');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
