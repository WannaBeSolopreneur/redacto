// Once the app says "Ready offline", every format must open, redact and export with the network off.
// Needs `npm run preview` running.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { strToU8, zipSync } from 'fflate';

const URL = process.env.APP_URL ?? 'http://localhost:4173/app/';
const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage([612, 300]).drawText('Patient Maria Delgado, phone (312) 555-0147.', { x: 40, y: 250, size: 12, font });
const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Maria Delgado called (312) 555-0147.</w:t></w:r></w:p></w:body></w:document>') });
const xlsx = zipSync({
  'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Zyra</t></is></c></row></sheetData></worksheet>'),
});
// A picture of text, so the image path needs OCR.
const png = await (async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 700, height: 120 } });
  await p.setContent('<body style="margin:0;background:#fff;font:32px Arial;padding:30px">Maria Delgado (312) 555-0147</body>');
  const shot = await p.screenshot(); await b.close(); return shot;
})();

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, bypassCSP: true });   // waitForFunction needs eval
const page = await ctx.newPage();
const failed = []; page.on('requestfailed', (r) => failed.push(r.url().replace(/^https?:\/\/[^/]+/, '')));
await page.goto(URL);
await page.getByRole('button', { name: /^(Download & activate|Activate) / }).first().click();   // nothing loads before this
await page.getByRole('button', { name: /^AI model: (?!not loaded)/ }).waitFor({ timeout: 120000 });   // model ready
await page.getByRole('button', { name: 'Ready offline' }).waitFor({ timeout: 120000 });                  // the rest of the app
await ctx.setOffline(true);

await page.locator('input[type=file]').first().setInputFiles([
  { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('Maria Delgado called (312) 555-0147.') },
  { name: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) },
  { name: 'c.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(docx) },
  { name: 'd.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsx) },
  { name: 'e.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Phone\nZyra,(312) 555-0147') },
  { name: 'f.png', mimeType: 'image/png', buffer: png },
]);
const items = page.getByRole('navigation', { name: 'Documents' }).locator('li');
await page.waitForFunction(() => [...document.querySelectorAll('nav[aria-label=Documents] li')].every((l) => /to redact|Nothing found|Couldn't open/.test(l.textContent)), null, { timeout: 180000 });
const status = await items.evaluateAll((ls) => ls.map((l) => l.innerText.replace(/\n/g, ' — ')));
console.log(status.join('\n'));
// Export one of each kind while offline.
for (const name of ['b.pdf', 'd.xlsx', 'e.csv', 'f.png']) {
  await page.getByRole('navigation', { name: 'Documents' }).getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) }).click();
  const ack = page.getByRole('checkbox', { name: /I reviewed the values/ });
  if (await ack.count()) await ack.check();
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: /^Download redacted/ }).click();
  console.log('exported', (await dl).suggestedFilename());
}
await browser.close();
const bad = status.filter((s) => /Couldn't open|rules only/.test(s));
assert.deepEqual(bad, [], `failed offline: ${bad.join('; ')}\nfailed requests: ${[...new Set(failed)].join(', ')}`);
console.log('Offline after load: every format opened, scanned and exported.');
