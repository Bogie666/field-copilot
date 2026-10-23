// Browser regression for component identity, reference precision and conflicting tabs.
// Synthetic local records only; every AI request is blocked.
// npm run build && npm run start; CHROMIUM_PATH=... npm run smoke:integrity
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const base = process.env.COPILOT_URL || 'http://127.0.0.1:3000';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/api/**', route => /\/health(?:\?|$)/.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.getByLabel('Job label (optional)').fill('Synthetic record-integrity regression');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('heading', { name: 'Synthetic record-integrity regression', exact: true }).waitFor();
    const jobPath = new URL(page.url()).pathname;
    const jobId = jobPath.split('/').pop();
    const readJob = () => page.evaluate(id => new Promise((resolve, reject) => {
      const open = indexedDB.open('field-copilot');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, request = db.transaction('jobs').objectStore('jobs').get(id);
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      };
    }), jobId);
    const initial = await readJob(), system = initial.systems[0];
    const toolUrl = (systemId, kind, tool) => `${base}${jobPath}/${kind}/${tool}?${new URLSearchParams({ system: systemId, component: `${systemId}:${kind}` })}`;
    const plate = async (kind, model) => {
      await page.goto(toolUrl(system.id, kind, 'nameplate'));
      await page.getByLabel('Model', { exact: true }).fill(model);
      await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
      await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    };
    await plate('condenser', 'OUTDOOR123');
    await plate('furnace', 'INDOOR456');
    await page.reload();
    assert.equal(await page.getByLabel('Model', { exact: true }).inputValue(), 'INDOOR456');
    await page.goto(toolUrl(system.id, 'condenser', 'nameplate'));
    assert.equal(await page.getByLabel('Model', { exact: true }).inputValue(), 'OUTDOOR123');

    // Printed-date suggestions remain reviewable, manual overrides are never replaced.
    const currentYear = new Date().getUTCFullYear();
    await page.getByLabel('Manufactured date (only if printed)', { exact: true }).fill('2016-01');
    const ageInput = page.getByLabel('Equipment age (years, optional)', { exact: true });
    assert.equal(await ageInput.inputValue(), String(currentYear - 2016));
    await page.getByText(/only the manufacture month and year are printed/).waitFor();
    await ageInput.fill('8');
    await page.getByLabel('Manufactured date (only if printed)', { exact: true }).fill('2015-01-01');
    assert.equal(await ageInput.inputValue(), '8', 'manual age survives date change');
    await page.getByRole('button', { name: 'Use age from manufacture date', exact: true }).click();
    assert.equal(await ageInput.inputValue(), String(currentYear - 2015));
    await page.getByLabel('Manufactured date (only if printed)', { exact: true }).fill('9999-01');
    assert.equal(await ageInput.inputValue(), '', 'future dates never invent an age');
    await page.getByText(/Age could not be calculated/).waitFor();
    await page.getByLabel('Manufactured date (only if printed)', { exact: true }).fill('2015-01-01');
    await page.getByLabel('Equipment type', { exact: true }).selectOption('Heat pump');
    await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    const datedPlate = (await readJob()).systems[0].components.find(c => c.kind === 'condenser');
    assert.equal(datedPlate.equipmentAge, String(currentYear - 2015));
    assert.equal(datedPlate.equipmentAgeSource, 'manufactured-date');
    assert.ok(Number.isFinite(Date.parse(datedPlate.equipmentAgeAsOf)));
    assert.equal(datedPlate.equipment.equipmentType, 'Heat pump');
    await page.reload();
    assert.equal(await ageInput.inputValue(), String(currentYear - 2015));
    assert.equal(await page.getByLabel('Equipment type', { exact: true }).inputValue(), 'Heat pump');
    await page.goBack();
    assert.equal(await page.getByLabel('Model', { exact: true }).inputValue(), 'INDOOR456', 'Back restores the exact indoor component');
    await page.goForward();
    assert.equal(await page.getByLabel('Model', { exact: true }).inputValue(), 'OUTDOOR123', 'Forward restores the exact outdoor component');
    console.log('PASS date-derived age precision, manual override, future-date rejection, saved provenance, type dropdown, Back and Forward');

    for (const kind of ['condenser', 'furnace']) {
      await page.goto(toolUrl(system.id, kind, 'electrical'));
      await page.getByLabel('Nominal voltage (V)').fill('230');
      await page.getByLabel('Line voltage (V)').fill('230');
      await page.getByRole('group', { name: 'Photos', exact: true }).waitFor();
      await page.getByLabel('Action taken (optional)').fill(`Recorded ${kind} measurements.`);
      await page.getByLabel('Verification after action (optional)').fill('No repair performed; readings documented.');
      await page.getByRole('button', { name: 'Save finding', exact: true }).click();
      await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    }
    const paired = (await readJob()).findings.filter(f => f.key === 'electrical');
    assert.equal(paired.length, 2);
    assert.equal(new Set(paired.map(f => f.scope.componentId)).size, 2);
    assert.ok(paired.every(f => f.actionTaken && f.verification));
    console.log('PASS paired plates/electrical findings, reload identity, ordinary photo picker and action/verification');

    await page.goto(toolUrl(system.id, 'furnace', 'nameplate'));
    await page.getByLabel('Max external static (in. w.c.)', { exact: true }).fill('.5');
    await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await page.goto(toolUrl(system.id, 'furnace', 'static'));
    assert.equal(await page.getByLabel(/Rated external static/).inputValue(), '0.5');
    await page.getByLabel(/Supply static/).fill('.3');
    await page.getByLabel(/Return static/).fill('.3');
    await page.getByText(/120 percent of the 0.50.*above the rating/).first().waitFor();
    await page.getByRole('button', { name: 'Save finding', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await plate('condenser', 'OUTDOOR-REPLACED');
    await page.goto(`${base}${jobPath}/condenser?${new URLSearchParams({ system: system.id, component: `${system.id}:condenser` })}`);
    await page.getByText(/Needs review|Needs reconfirmation/).first().waitFor();
    console.log('PASS leading decimal through nameplate/result/save and stale overview');

    const url = toolUrl(system.id, 'condenser', 'nameplate');
    await page.goto(url);
    const other = await context.newPage();
    await other.goto(url);
    await page.getByLabel('Model', { exact: true }).fill('TAB-A-NEW');
    await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await other.getByLabel('Serial', { exact: true }).fill('TAB-B-SERIAL');
    // Nameplate drafts now persist too; the stale tab detects its conflict on editing,
    // before an explicit confirmation can overwrite the other tab.
    await other.getByText(/changed in another tab/).first().waitFor();
    assert.equal(await other.getByLabel('Serial', { exact: true }).inputValue(), 'TAB-B-SERIAL');
    const persisted = (await readJob()).systems[0].components.find(c => c.kind === 'condenser');
    assert.equal(persisted.equipment.model, 'TAB-A-NEW');
    assert.notEqual(persisted.equipment.serial, 'TAB-B-SERIAL');
    await other.close();
    console.log('PASS concurrent tab conflict preserves canonical save and uncommitted local input');

    await page.goto(`${base}${jobPath}/condenser/nameplate?system=removed&component=removed`);
    await page.getByRole('heading', { name: 'Choose the equipment' }).waitFor();
    assert.equal(await page.getByLabel('Model', { exact: true }).count(), 0);
    await page.goto(`${base}${jobPath}/condenser/nameplate`);
    await page.getByRole('heading', { name: 'Choose the equipment' }).waitFor();
    assert.equal(await page.getByLabel('Model', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS invalid and context-free links never silently retarget equipment');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
