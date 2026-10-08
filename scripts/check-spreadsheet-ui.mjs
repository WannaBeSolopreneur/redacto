// Run against a local preview after `npm run build && npm run preview`.
// Example: node scripts/check-spreadsheet-ui.mjs webkit
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const browserType = { chromium, firefox, webkit }[process.argv[2] ?? 'chromium'];
assert.ok(browserType, 'Choose chromium, firefox or webkit');
const browser = await browserType.launch();
try {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('redact-local.settings.v1', JSON.stringify({ useML: false })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.UI_TEST_URL ?? 'http://localhost:4173/app/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Code\nZyra,00123\nNori,00456') });
  await page.getByRole('button', { name: 'Redact column B', exact: true }).click();
  await page.getByRole('tab', { name: 'Redacted result', exact: true }).click();
  await page.getByText('[CUSTOM_1]', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Undo review change', exact: true }).click();
  assert.ok(await page.locator('main table').getByText('00123', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Redo review change', exact: true }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download redacted CSV', exact: true }).click();
  const csvText = await readFile(await (await csvDownload).path(), 'utf8');
  assert.ok(!csvText.includes('Zyra') && !csvText.includes('00123'));

  const xlsx = zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Private sheet" sheetId="1" r:id="rId1" state="hidden"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Zyra</t></is></c></row></sheetData></worksheet>'),
  });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'people.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsx) });
  await page.getByRole('tab', { name: 'Private sheet · hidden in original', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: /I reviewed the values/ }).check();
  const excelDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download redacted XLSX', exact: true }).click();
  const cleaned = unzipSync(new Uint8Array(await readFile(await (await excelDownload).path())));
  assert.ok(strFromU8(cleaned['xl/worksheets/sheet1.xml']).includes('[PERSON_1]'));
  assert.ok(!strFromU8(cleaned['xl/workbook.xml']).includes('Private'));
  await page.getByRole('button', { name: /^people\.csv/ }).click();
  assert.equal(await page.getByRole('tab', { name: 'Redacted result', exact: true }).getAttribute('aria-selected'), 'true');
  assert.ok(await page.getByText('[CUSTOM_1]', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Clear workspace', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear all documents', exact: true }).click();
  await page.getByRole('button', { name: 'Choose files', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`${browserType.name()}: spreadsheet import, review, undo/redo, switching, downloads and clear-workspace passed.`);
} finally { await browser.close(); }
