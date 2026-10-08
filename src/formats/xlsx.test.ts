import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { Replacer } from '../core/transform';
import { loadFile } from './index';
import { readXlsx, writeXlsx } from './xlsx-codec';
import { buildTable } from './table';

/** Minimal zip builder for fixtures. */
class Zip {
  files: Record<string, Uint8Array> = {};
  static async load(data: ArrayBuffer | Uint8Array) {
    const z = new Zip();
    z.files = unzipSync(new Uint8Array(data));
    return z;
  }
  file(name: string, text: string) { this.files[name] = strToU8(text); }
  text(name: string) { return this.files[name] ? strFromU8(this.files[name]) : null; }
  bytes() { return zipSync(this.files).buffer as ArrayBuffer; }
}

async function workbook(formula = '<f>1+1</f><v>2</v>') {
  const zip = new Zip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Jane secret" sheetId="1" r:id="rId1" state="hidden"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Name</t></si><si><r><t>Jane </t></r><r><t>Doe</t></r></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><cols><col min="1" max="1" hidden="1"/></cols><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Count</t></is></c></row><row r="2" hidden="1"><c r="A2" t="s"><v>1</v></c><c r="B2">${formula}</c><c r="C2" t="inlineStr"><is><t>=1+1</t></is></c></row></sheetData></worksheet>`);
  zip.file('docProps/core.xml', '<secret>Jane Doe</secret>');
  zip.file('xl/comments1.xml', '<secret>Jane Doe</secret>');
  zip.file('xl/media/image1.png', 'secret');
  return new File([zip.bytes()], 'people.xlsx');
}

describe('clean XLSX', () => {
  it('loads hidden cells and rich shared strings then writes only reviewed values to a new package', async () => {
    const doc = await loadFile(await workbook(), { forceOcr: false }, () => {});
    expect(doc.kind).toBe('xlsx');
    expect(doc.table?.sheets[0].hidden).toBe(true);
    expect(doc.table?.sheets[0].hiddenRows).toContain(1);
    expect(doc.table?.sheets[0].rows[1][0].value).toBe('Jane Doe');
    expect(doc.notes.join(' ')).toMatch(/formula/i);
    const result = await doc.export(doc.structural!, new Replacer('label'));
    const zip = await Zip.load(await result.blob.arrayBuffer());
    expect(zip.text('docProps/core.xml')).toBeNull();
    expect(zip.text('xl/comments1.xml')).toBeNull();
    expect(zip.text('xl/media/image1.png')).toBeNull();
    const xml = zip.text('xl/worksheets/sheet1.xml')!;
    expect(xml).toContain('[PERSON_1]');
    expect(xml).not.toContain('Jane');
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('=1+1'); // literal inline string, never a formula
    expect(xml).toContain('<v>2</v>');
    expect(zip.text('xl/workbook.xml')!).not.toContain('Jane');
    const reopened = await loadFile(new File([result.blob], 'clean.xlsx'), { forceOcr: false }, () => {});
    expect(reopened.table?.sheets[0].rows[1].map((c) => c.value)).toEqual(['[PERSON_1]', '2', '=1+1']);
  });

  it('discloses formulas without cached results and does not export their expression', async () => {
    const doc = await loadFile(await workbook('<f>"Jane Doe"</f>'), { forceOcr: false }, () => {});
    expect(doc.notes.join(' ')).toMatch(/1.*without.*cached/i);
    expect(doc.table?.sheets[0].rows[1][1].value).toBe('');
  });

  it('rejects a corrupt workbook instead of silently skipping sheets', async () => {
    const zip = new Zip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Missing"/></sheets></workbook>');
    await expect(loadFile(new File([zip.bytes()], 'bad.xlsx'), { forceOcr: false }, () => {})).rejects.toThrow();
  });

  it('round-trips literal Excel escape sequences, ampersands and unicode without executing formulas', async () => {
    const table = buildTable([{ name: 'Private name', rows: [[{ value: '_x0041_ & <Zoë> =1+1' }]] }]).table;
    const bytes = await writeXlsx(table, [[['_x0041_ & <Zoë> =1+1']]]);
    const read = await readXlsx(bytes.buffer as ArrayBuffer);
    expect(read.sheets[0].rows[0][0].value).toBe('_x0041_ & <Zoë> =1+1');
  });

  it('scans all sheets and maintains replacements across them', async () => {
    const table = buildTable([
      { name: 'First', rows: [[{ value: 'Name' }], [{ value: 'Jane' }]] },
      { name: 'Hidden', hidden: true, rows: [[{ value: 'Name' }], [{ value: 'Jane' }]] },
    ]).table;
    const bytes = await writeXlsx(table, [[['Name'], ['Jane']], [['Name'], ['Jane']]]);
    const doc = await loadFile(new File([bytes as BlobPart], 'two.xlsx'), { forceOcr: false }, () => {});
    const result = await doc.export(doc.structural!, new Replacer('label'));
    const read = await readXlsx(await result.blob.arrayBuffer());
    expect(read.sheets.map((s) => s.rows[1][0].value)).toEqual(['[PERSON_1]', '[PERSON_1]']);
  });

  it('recognizes dates and zero-padded IDs from cell styles', async () => {
    const zip = await Zip.load(await (await workbook()).arrayBuffer());
    zip.file('xl/styles.xml', '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>45292</v></c><c r="B1" s="2"><v>123</v></c></row></sheetData></worksheet>');
    const read = await readXlsx(zip.bytes());
    expect(read.sheets[0].rows[0].map((c) => c.value)).toEqual(['2024-01-01', '00123']);
  });

  it('rejects external sheets and XML entity declarations', async () => {
    const zip = await Zip.load(await (await workbook()).arrayBuffer());
    zip.file('xl/workbook.xml', '<!DOCTYPE workbook [<!ENTITY pii "Jane">]><workbook/>');
    await expect(readXlsx(zip.bytes())).rejects.toThrow(/declarations/);
    zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Remote" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" TargetMode="External" Target="https://example.com/sheet.xml"/></Relationships>');
    await expect(readXlsx(zip.bytes())).rejects.toThrow(/unsupported|missing/);
  });

  it('does not round long numeric identifiers during clean export', async () => {
    const zip = await Zip.load(await (await workbook()).arrayBuffer());
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"><v>12345678901234567890</v></c></row></sheetData></worksheet>');
    const doc = await loadFile(new File([zip.bytes()], 'ids.xlsx'), { forceOcr: false }, () => {});
    const out = await doc.export([], new Replacer('label'));
    const read = await readXlsx(await out.blob.arrayBuffer());
    expect(read.sheets[0].rows[0][0].value).toBe('12345678901234567890');
  });

  it('reads sheets whose rows and cells omit the optional r attribute', async () => {
    const zip = new Zip();
    zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c t="inlineStr"><is><t>Name</t></is></c><c t="inlineStr"><is><t>Code</t></is></c></row><row><c t="inlineStr"><is><t>Zyra</t></is></c><c r="C2"><v>7</v></c></row></sheetData></worksheet>');
    const { sheets } = await readXlsx(zip.bytes());
    expect(sheets[0].rows.map((r) => r.map((c) => c.value))).toEqual([['Name', 'Code'], ['Zyra', '', '7']]);
  });
});
