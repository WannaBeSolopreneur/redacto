import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { Replacer } from '../core/transform';
import { loadCsv } from './csv';

describe('spreadsheet CSV boundaries', () => {
  it('scans row one rather than silently treating personal data as a header', async () => {
    const doc = await loadCsv(new File(['ann@example.org,00123\nbob@example.org,00456'], 'contacts.csv'));
    expect(doc.text).toContain('ann@example.org');
    expect(doc.table?.sheets[0].rows[0][1].value).toBe('00123');
    expect(doc.table?.sheets[0].headerRow).toBe(false);
  });

  it('preserves cells, quoting, empty rows and leading zeros in TSV', async () => {
    const doc = await loadCsv(new File(['Name\tCode\r\n"Jane\nDoe"\t00123\r\n\t\r\nBob\t00456'], 'people.tsv'));
    const out = await doc.export([], new Replacer('label'));
    expect(Papa.parse(await out.blob.text(), { delimiter: '\t' }).data).toEqual([
      ['Name', 'Code'], ['Jane\nDoe', '00123'], ['', ''], ['Bob', '00456'],
    ]);
  });

  it('rejects broken quoted input rather than exporting corrupted cells', async () => {
    await expect(loadCsv(new File(['Name,Notes\nJane,"unfinished'], 'broken.csv'))).rejects.toThrow(/quot|malformed/i);
  });

  it('exports formula-like strings as inert text, including in row one', async () => {
    const doc = await loadCsv(new File(['=1+1,Notes\n@SUM(A1),safe'], 'formulas.csv'));
    const out = await doc.export([], new Replacer('label'));
    expect(Papa.parse(await out.blob.text()).data).toEqual([["'=1+1", 'Notes'], ["'@SUM(A1)", 'safe']]);
  });

  it('uses header context but never exports generated context as cell content', async () => {
    const doc = await loadCsv(new File(['First Name,Notes\nZyra,"hello, world"'], 'names.csv'));
    expect(doc.structural?.map((e) => e.text)).toContain('Zyra');
    const out = await doc.export(doc.structural!, new Replacer('label'));
    expect(Papa.parse(await out.blob.text()).data).toEqual([['First Name', 'Notes'], ['[PERSON_1]', 'hello, world']]);
  });

  it('reads UTF-16 tab-separated files exported by Excel', async () => {
    const text = 'Name\tCode\r\nZoë\t00123';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([255, 254]);
    for (let i = 0; i < text.length; i++) { bytes[2 + i * 2] = text.charCodeAt(i) & 255; bytes[3 + i * 2] = text.charCodeAt(i) >> 8; }
    const doc = await loadCsv(new File([bytes], 'excel.tsv'));
    expect(doc.table?.sheets[0].rows[1].map((c) => c.value)).toEqual(['Zoë', '00123']);
  });

  it('keeps negative amounts as numbers while still neutralising formulas', async () => {
    const doc = await loadCsv(new File(['Amount,Memo\n-350.00,-cmd|calc\n+44,=HYPERLINK("x")'], 'bank.csv'));
    const out = await doc.export([], new Replacer('label'));
    expect(Papa.parse(await out.blob.text()).data).toEqual([['Amount', 'Memo'], ['-350.00', "'-cmd|calc"], ['+44', "'=HYPERLINK(\"x\")"]]);
  });

  it('reads Windows-1252 CSVs from Excel and writes UTF-8 with a BOM', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Name\nRen'), 0xe9, 0x0a]); // "René" in cp1252
    const doc = await loadCsv(new File([bytes], 'legacy.csv'));
    expect(doc.table?.sheets[0].rows[1][0].value).toBe('René');
    expect(doc.notes.join(' ')).toMatch(/Windows/);
    const out = new Uint8Array(await (await doc.export([], new Replacer('label'))).blob.arrayBuffer());
    expect([...out.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('treats a label row above numbers as a header even without known column names', async () => {
    const bank = await loadCsv(new File(['Date,Description,Amount\n01/02/2025,Zelle To Omar Siddiqui,-350.00'], 'bank.csv'));
    expect(bank.table?.sheets[0].headerRow).toBe(true);
    expect(bank.text).toContain('Description: Zelle To Omar Siddiqui');
    const names = await loadCsv(new File(['Zyra,Okafor\nNori,Adeyemi'], 'names.csv'));
    expect(names.table?.sheets[0].headerRow).toBe(false);
  });
});
