// Regression smoke: all AI requests mocked; never calls a model.
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try {
 const page=await b.newPage();
 await page.addInitScript(() => {
  window.SpeechRecognition = class {
   start() { window.__testDictation = this; }
   stop() { this.onend?.(); }
  };
 }); let release;
 await page.route('**/api/structure-notes',async route=>{
  await new Promise(resolve=>release=resolve);
  await route.fulfill({json:{provider:'mock-only',workPerformed:'Not documented',measurementsReadings:'Not documented',diagnosisFindings:'Old draft',recommendations:'Not documented',customerDeclinedWork:'Not documented'}}).catch(()=>{});
 });
 await page.goto(process.env.COPILOT_URL || 'http://127.0.0.1:3000');
 await page.getByRole('button',{name:'Start job'}).click();
 await page.getByRole('link',{name:/Furnace or air handler/}).click();
 await page.getByRole('link',{name:/Voice notes/}).click();
 await page.waitForLoadState('networkidle');
 const notes=page.getByLabel('Notes',{exact:true});
 await notes.fill('Original technician note');
 await page.getByRole('button',{name:'Tidy into sections'}).click();
 await page.waitForTimeout(150);
 await notes.fill('Newer technician edits must not be lost');
 release(); await page.waitForTimeout(500);
 assert.equal(await notes.inputValue(),'Newer technician edits must not be lost');
 console.log('PASS delayed AI tidy cannot overwrite newer technician notes');
 await page.reload();
 await page.getByLabel('Notes',{exact:true}).waitFor();
 await page.waitForTimeout(250);
 assert.equal(await notes.inputValue(),'Newer technician edits must not be lost');
 console.log('PASS notes edits preserved after reload');
 const boundary = 'x'.repeat(11995);
 await notes.fill(boundary);
 await page.getByRole('button',{name:'Dictate',exact:true}).click();
 await page.evaluate(() => window.__testDictation.onresult({ resultIndex:0, results:[{0:{transcript:'CRITICAL TAIL'},isFinal:true,length:1}] }));
 await page.waitForFunction(() => document.querySelector('textarea')?.value.endsWith('CRITICAL TAIL'));
 assert.ok((await notes.inputValue()).length > 12000);
 assert.match(await page.getByRole('status').last().innerText(), /unsaved|not saved|too long|limit/i);
 await page.reload();
 assert.equal(await notes.inputValue(),boundary,'overflow must not replace the last valid saved note');
 console.log('PASS oversized dictation is explicitly unsaved and preserves original persisted notes');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
