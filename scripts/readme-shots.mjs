// Screenshots for README.md, from the running preview (`npm run build && npm run preview`).
// All documents are fictional. Writes docs/screenshots/*.webp (needs `cwebp`).
// Usage: node scripts/readme-shots.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shoot = async (page, name, opts = {}) => {
  const png = `${OUT}/${name}.png`;
  await page.screenshot({ path: png, ...opts });
  execFileSync('cwebp', ['-quiet', '-q', '86', png, '-o', `${OUT}/${name}.webp`]);
  rmSync(png);
  console.log('wrote', `${OUT}/${name}.webp`);
};
const newPage = () => browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// A fictional lab report as a real PDF (text layer, embedded fonts).
const labPdf = await (async () => {
  const p = await browser.newPage();
  await p.setContent(`<html><body style="font:14px/1.6 Helvetica,Arial;padding:48px 56px;color:#111">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px">
      <div><b style="font-size:20px">Northside Medical Lab</b><br>1200 Lake Shore Dr, Chicago, IL 60610 · (312) 555-0100</div>
      <div style="text-align:right">Laboratory report<br>Collected: March 3, 2026</div></div>
    <table style="margin-top:20px;border-collapse:collapse;width:100%">
      <tr><td style="width:160px;color:#555">Patient</td><td>Maria Delgado</td><td style="color:#555">Date of birth</td><td>04/12/1987</td></tr>
      <tr><td style="color:#555">Patient ID</td><td>MRN 00483921</td><td style="color:#555">Phone</td><td>(312) 555-0147</td></tr>
      <tr><td style="color:#555">Address</td><td colspan="3">1842 W Fulton St, Chicago, IL 60612</td></tr>
      <tr><td style="color:#555">Email</td><td colspan="3">maria.delgado@example.com</td></tr>
      <tr><td style="color:#555">Ordered by</td><td colspan="3">Dr. James Whitfield, Northside Family Medicine</td></tr></table>
    <h3 style="margin-top:28px;border-bottom:1px solid #ccc">Results</h3>
    <table style="border-collapse:collapse;width:100%">
      <tr style="color:#555"><td>Test</td><td>Result</td><td>Reference range</td><td>Flag</td></tr>
      <tr><td>Hemoglobin A1c</td><td>6.8 %</td><td>4.0 – 5.6 %</td><td><b>HIGH</b></td></tr>
      <tr><td>LDL cholesterol</td><td>168 mg/dL</td><td>&lt; 100 mg/dL</td><td><b>HIGH</b></td></tr>
      <tr><td>Fasting glucose</td><td>118 mg/dL</td><td>70 – 99 mg/dL</td><td><b>HIGH</b></td></tr>
      <tr><td>TSH</td><td>2.1 mIU/L</td><td>0.4 – 4.0 mIU/L</td><td></td></tr></table>
    <p style="margin-top:28px">Comments: Maria Delgado to repeat HbA1c in 3 months, as ordered by Dr. James Whitfield.
      Questions: call (312) 555-0147 or email maria.delgado@example.com.</p></body></html>`);
  const pdf = await p.pdf({ format: 'Letter' });
  await p.close();
  return pdf;
})();
const customers = 'Customer,Email,Phone,City,Account,Notes,Spend\n' + [
  ['Maria Delgado', 'maria.delgado@example.com', '(312) 555-0147', 'Chicago', '4402-7719', 'Asked about the March invoice', '1240.00'],
  ['Kwame Mensah', 'kwame.m@example.org', '(646) 555-0199', 'New York', '5511-0932', 'Prefers email', '860.50'],
  ['Ana Souza', 'ana.souza@example.net', '(415) 555-0123', 'Oakland', '6120-4417', 'Referred by Kwame Mensah', '3371.00'],
  ['Liam O’Connor', 'liam.oc@example.com', '(617) 555-0172', 'Boston', '7731-2208', 'Call after 5pm', '415.25'],
  ['Priya Raman', 'priya.r@example.com', '(734) 555-0187', 'Ann Arbor', '8840-1196', 'VIP, renewal in June', '2210.75'],
  ['Maria Delgado', 'maria.delgado@example.com', '(312) 555-0147', 'Chicago', '4402-7719', 'Second order', '2105.00'],
  ['Chen Wei', 'chen.wei@example.org', '(206) 555-0164', 'Seattle', '9015-5532', 'Net 30 terms', '980.00'],
].map((r) => r.map((v) => (v.includes(',') ? `"${v}"` : v)).join(',')).join('\n');

// Landing page
{
  const page = await newPage();
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(800);
  await shoot(page, 'landing');
  await page.close();
}

// App: welcome, then documents
{
  const page = await newPage();
  await page.goto(`${BASE}/app/`);
  await page.getByRole('button', { name: /^AI model: (?!not loaded)/ }).waitFor({ timeout: 120000 });
  await shoot(page, 'app-welcome');

  const nav = page.getByRole('navigation', { name: 'Documents' });
  const done = (name) => nav.getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}.*(to redact|Nothing found)`) }).waitFor({ timeout: 120000 });

  await page.getByRole('button', { name: /try a sample record/ }).click();
  await done('Sample record.txt');
  await page.waitForTimeout(400);
  await shoot(page, 'app-review');

  await page.getByRole('tab', { name: 'Redacted result' }).click();
  await page.waitForTimeout(400);
  await shoot(page, 'app-result');

  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'lab_results.pdf', mimeType: 'application/pdf', buffer: labPdf },
    { name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(customers) },
  ]);
  await done('lab_results.pdf');
  await done('customers.csv');
  await nav.getByRole('button', { name: /^lab_results\.pdf/ }).click();
  await page.waitForTimeout(800);
  await shoot(page, 'app-pdf');
  await nav.getByRole('button', { name: /^customers\.csv/ }).click();
  await page.waitForTimeout(600);
  await shoot(page, 'app-spreadsheet');
  await page.close();
}
await browser.close();
