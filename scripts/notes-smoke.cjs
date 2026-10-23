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
 }); let release; let hold = true;
 await page.route('**/api/structure-notes',async route=>{
  if (hold) await new Promise(resolve=>release=resolve);
  await route.fulfill({json:{provider:'mock-only',workPerformed:'Not documented',measurementsReadings:'Not documented',diagnosisFindings:'Old draft',recommendations:'Not documented',customerDeclinedWork:'Not documented'}}).catch(()=>{});
 });
 await page.goto(process.env.COPILOT_URL || 'http://127.0.0.1:3000');
 await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.getByRole('link',{name:/Furnace or air handler/}).click();
 await page.getByRole('link',{name:/Job notes/}).click();
 await page.waitForLoadState('networkidle');
 const notes=page.getByLabel('Notes',{exact:true});
 await notes.fill('Original technician note');
 await page.getByRole('button',{name:'Tidy into sections'}).click();
 await page.waitForTimeout(150);
 await notes.fill('Newer technician edits must not be lost');
 hold = false; release(); await page.waitForTimeout(500);
 assert.equal(await notes.inputValue(),'Newer technician edits must not be lost');
 console.log('PASS delayed AI tidy cannot overwrite newer technician notes');
 await page.reload();
 await page.getByLabel('Notes',{exact:true}).waitFor();
 await page.waitForTimeout(250);
 assert.equal(await notes.inputValue(),'Newer technician edits must not be lost');
 console.log('PASS notes edits preserved after reload');
 const original = 'No leak observed. Customer declined optional work. 238 V measured; exact wording must survive.';
 await notes.fill(original);
 await page.getByText('Notes saved on this device.', {exact:true}).waitFor();
 await page.getByRole('button',{name:'Tidy into sections'}).click();
 await page.getByRole('heading',{name:'Review note edit'}).waitFor();
 assert.equal(await notes.inputValue(), original, 'AI suggestion must not overwrite original before acceptance');
 assert.equal(await page.getByLabel('Original notes',{exact:true}).inputValue(), original);
 const proposal = await page.getByLabel('Proposed notes',{exact:true}).inputValue();
 assert.match(proposal, /Old draft/);
 await page.getByRole('button',{name:'Discard edit',exact:true}).click();
 await page.reload();
 assert.equal(await notes.inputValue(), original, 'discard leaves persisted original unchanged');
 console.log('PASS AI tidy shows original and proposal, with discard preserving saved original');
 await page.getByRole('button',{name:'Tidy into sections'}).click();
 await page.getByRole('heading',{name:'Review note edit'}).waitFor();
 await notes.fill(original + ' Newer field edit');
 assert.equal(await page.getByRole('button',{name:'Accept edit and retain original',exact:true}).count(),0,'editing invalidates an existing preview');
 await page.getByText('Notes saved on this device.', {exact:true}).waitFor();
 await page.getByRole('button',{name:'Tidy into sections'}).click();
 await page.getByRole('heading',{name:'Review note edit'}).waitFor();
 await page.getByRole('button',{name:'Accept edit and retain original',exact:true}).click();
 await page.getByText('Accepted edit and original notes saved on this device.',{exact:true}).waitFor();
 assert.match(await notes.inputValue(), /Old draft/);
 await page.reload();
 assert.match(await notes.inputValue(), /Old draft/);
 assert.equal(await page.getByLabel('Retained original 1',{exact:true}).inputValue(),original + ' Newer field edit');
 console.log('PASS explicit acceptance persists both original and accepted notes across reload');
 const notesUrl = page.url();
 const jobUrl = notesUrl.match(/^.*\/job\/[^/]+/)[0];
 await page.goto(`${jobUrl}/summary`);
 await page.getByRole('heading',{name:'Summary',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Copy customer visit summary',exact:true}).isDisabled(),true);
 await page.getByLabel(/I reviewed this summary against/).check();
 assert.equal(await page.getByRole('button',{name:'Copy customer visit summary',exact:true}).isDisabled(),false);
 const downloadEvent = page.waitForEvent('download');
 await page.getByRole('button',{name:'Download structured evidence (.json)',exact:true}).click();
 const download = await downloadEvent;
 const stream = await download.createReadStream();
 let downloaded = ''; for await (const chunk of stream) downloaded += chunk;
 const evidence = JSON.parse(downloaded);
 assert.equal(evidence.photoContent,'metadata-only');
 assert.equal(evidence.job.notesTidyHistory[0].original, original + ' Newer field edit');
 assert.match(evidence.limitations.join(' '), /not a restorable backup/);
 assert.match(evidence.limitations.join(' '), /not a safety certification/);
 console.log('PASS deterministic report downloads notes/history with clear limitations, without AI');
 await page.goto(notesUrl);
 await notes.waitFor();
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
