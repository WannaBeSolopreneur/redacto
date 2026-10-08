import { DOMParser } from '@xmldom/xmldom';
import { columnLabel, type SheetInput, type TableData } from './table';
import { readZip, writeZip, type ZipEntries } from './zip';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const nodes = (root: Document | Element, name: string) => Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name);
const child = (root: Element, name: string) => Array.from(root.childNodes).find((n) => n.nodeType === 1 && (n as Element).localName === name) as Element | undefined;
const val = (root: Element, name: string) => child(root, name)?.textContent ?? '';
// XML 1.0 forbids these control characters.
// eslint-disable-next-line no-control-regex
const escapeXml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/_x[0-9a-f]{4}_/gi, (m) => `_x005F_${m.slice(1)}`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decodeExcel = (s: string) => s.replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;

function readXml(zip: ZipEntries, path: string, optional = false): Document | null {
  const text = zip.text(path);
  if (text === undefined) {
    if (optional) return null;
    throw new Error(`Incomplete Excel workbook: missing ${path}.`);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Excel XML with document type declarations is not supported.');
  let invalid = false;
  const doc = new DOMParser({ errorHandler: () => { invalid = true; } }).parseFromString(text, 'application/xml');
  if (invalid || !doc?.documentElement) throw new Error('Malformed Excel XML. Resave this workbook as .xlsx and try again.');
  return doc;
}

function richText(el: Element): string {
  return decodeExcel(nodes(el, 't').filter((t) => t.parentNode && (t.parentNode as Element).localName !== 'rPh').map((t) => t.textContent ?? '').join(''));
}

function pathFor(target: string): string {
  if (/^[a-z]+:/i.test(target) || target.includes('\\')) throw new Error('External worksheet references are not supported.');
  const parts: string[] = target.startsWith('/') ? [] : ['xl'];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('Invalid worksheet path.'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function address(s: string): [number, number] {
  const m = /^([A-Z]+)([1-9]\d*)$/i.exec(s);
  if (!m) throw new Error('Invalid Excel cell address.');
  let col = 0;
  for (const c of m[1].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64;
  const row = Number(m[2]);
  if (row > 100_000 || col > 1024) throw new Error('Workbook exceeds the supported 100,000 rows or 1,024 columns. Split it into smaller files.');
  return [row - 1, col - 1];
}

function numericDisplay(raw: string, formatId: number, format: string, date1904: boolean): { value: string; scalar?: number } {
  const number = Number(raw);
  if (!raw || !Number.isFinite(number)) return { value: raw };
  // Keep identifiers beyond JavaScript's exact integer range as literal text.
  if (Number.isInteger(number) && !Number.isSafeInteger(number)) return { value: raw };
  const dateFormat = (formatId >= 14 && formatId <= 22) || (formatId >= 45 && formatId <= 47) || /[ymdhis]/i.test(format.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, ''));
  if (dateFormat) {
    const days = date1904 ? number : number - (number >= 60 ? 1 : 0);
    const stamp = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31) + Math.round(days * 86400000));
    if (!Number.isFinite(stamp.getTime())) return { value: raw };
    return { value: Number.isInteger(number) ? stamp.toISOString().slice(0, 10) : stamp.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') };
  }
  // Preserve common zero-padded identifiers as strings.
  if (/^0{2,}$/.test(format) && number >= 0 && Number.isInteger(number)) return { value: String(number).padStart(format.length, '0') };
  return { value: raw, scalar: number };
}

export async function readXlsx(buffer: ArrayBuffer): Promise<{ sheets: SheetInput[]; notes: string[] }> {
  if (buffer.byteLength > 30_000_000) throw new Error('Excel files over 30 MB should be split into smaller workbooks.');
  // Only the XML parts we read are inflated; media, comments and metadata are never touched.
  const zip = readZip(new Uint8Array(buffer), (name) => /^xl\/.*\.(xml|rels)$/i.test(name),
    { entry: 32_000_000, total: 200_000_000, message: 'Excel XML is too large. Split this workbook into smaller files.' });
  if (zip.has('xl/vbaProject.bin')) throw new Error('Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.');
  const workbook = readXml(zip, 'xl/workbook.xml')!;
  const rels = readXml(zip, 'xl/_rels/workbook.xml.rels')!;
  const strings = readXml(zip, 'xl/sharedStrings.xml', true);
  const shared = strings ? nodes(strings, 'si').map(richText) : [];
  const styles = readXml(zip, 'xl/styles.xml', true);
  const formats = new Map(styles ? nodes(styles, 'numFmt').map((e) => [Number(e.getAttribute('numFmtId')), e.getAttribute('formatCode') ?? '']) : []);
  const xfs = styles ? nodes(styles, 'cellXfs')[0] : undefined;
  const styleIds = xfs ? nodes(xfs, 'xf').map((e) => Number(e.getAttribute('numFmtId'))) : [];
  const date1904 = ['1', 'true'].includes(nodes(workbook, 'workbookPr')[0]?.getAttribute('date1904') ?? '');
  const sheets: SheetInput[] = [];
  let formulas = 0, missing = 0, cells = 0, chars = 0, slots = 0, merged = false;
  const sheetNodes = nodes(workbook, 'sheet');
  if (!sheetNodes.length || sheetNodes.length > 100) throw new Error('Workbook must contain between 1 and 100 worksheets.');
  for (const sheet of sheetNodes) {
    const id = sheet.getAttributeNS(REL, 'id') || sheet.getAttribute('r:id');
    const link = nodes(rels, 'Relationship').find((r) => r.getAttribute('Id') === id);
    if (!link || !link.getAttribute('Type')?.endsWith('/worksheet') || link.getAttribute('TargetMode') === 'External') throw new Error('Workbook contains an unsupported or missing sheet. Save standard worksheets as .xlsx.');
    const page = readXml(zip, pathFor(link.getAttribute('Target')!))!;
    merged ||= nodes(page, 'mergeCell').length > 0;
    const rows: SheetInput['rows'] = [];
    const hiddenRows: number[] = [], hiddenColumns: number[] = [];
    for (const col of nodes(page, 'col')) if (['1', 'true'].includes(col.getAttribute('hidden') ?? '')) {
      const min = Number(col.getAttribute('min')), max = Math.min(1024, Number(col.getAttribute('max')));
      for (let c = min; c <= max; c++) if (c > 0) hiddenColumns.push(c - 1);
    }
    // "r" (row number / cell address) is optional in the spec; without it, position follows the previous one.
    let nextRow = 0;
    for (const row of nodes(page, 'row')) {
      const ri = row.hasAttribute('r') ? Number(row.getAttribute('r')) - 1 : nextRow;
      if (!Number.isInteger(ri) || ri < 0 || ri >= 100_000) throw new Error('Unsupported Excel row index.');
      nextRow = ri + 1;
      if (['1', 'true'].includes(row.getAttribute('hidden') ?? '')) hiddenRows.push(ri);
      rows[ri] ??= [];
      let nextCol = 0;
      for (const c of nodes(row, 'c')) {
        const [r, ci] = c.hasAttribute('r') ? address(c.getAttribute('r')!) : [ri, nextCol];
        if (r !== ri) throw new Error('Inconsistent Excel cell address.');
        if (ci >= 1024) throw new Error('Workbook exceeds the supported 100,000 rows or 1,024 columns. Split it into smaller files.');
        nextCol = ci + 1;
        if (++cells > 250_000) throw new Error('Workbook exceeds 250,000 populated cells. Split it into smaller files.');
        const type = c.getAttribute('t');
        const v = val(c, 'v');
        if (child(c, 'f')) { formulas++; if (!child(c, 'v') || !v) missing++; }
        let cell: { value: string; scalar?: number | boolean };
        if (type === 's') {
          if (!/^\d+$/.test(v) || Number(v) >= shared.length) throw new Error('Invalid Excel shared string reference.');
          cell = { value: shared[Number(v)] };
        } else if (type === 'inlineStr') cell = { value: child(c, 'is') ? richText(child(c, 'is')!) : '' };
        else if (type === 'b') cell = { value: v === '1' ? 'TRUE' : 'FALSE', scalar: v === '1' };
        else if (type === 'str' || type === 'e' || type === 'd') cell = { value: decodeExcel(v) };
        else {
          const formatId = styleIds[Number(c.getAttribute('s') || 0)] ?? 0;
          cell = numericDisplay(v, formatId, formats.get(formatId) ?? '', date1904);
        }
        chars += cell.value.length;
        if (chars > 10_000_000) throw new Error('Workbook text is too large. Split it into smaller files.');
        rows[ri][ci] = cell;
      }
    }
    // Bound sparse-to-dense expansion before allocating missing cells.
    const allocated = rows.reduce((n, row) => n + (row?.length ?? 0), 0);
    slots += allocated + rows.length;
    if (slots > 500_000) throw new Error('Workbook has too many sparse cells. Remove unused columns or split it.');
    const filled = Array.from({ length: rows.length }, (_, ri) => Array.from({ length: rows[ri]?.length ?? 0 }, (_, ci) => rows[ri]?.[ci] ?? { value: '' }));
    sheets.push({ name: sheet.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows: filled, hidden: ['hidden', 'veryHidden'].includes(sheet.getAttribute('state') ?? ''), hiddenRows, hiddenColumns });
  }
  return { sheets, notes: [
    'Clean Excel export keeps cell positions and values only. All sheets, rows and columns are made visible; sheet names become Sheet 1, Sheet 2, etc.',
    'Original formatting, comments, links, images, charts, embedded files and metadata are not copied. Embedded images are not scanned and will be removed.',
    'Dates are shown as ISO text; other numeric formatting is normalized. Check identifiers and dates in the grid.',
    ...(merged ? ['Merged cells are unmerged; their value stays in the top-left cell.'] : []),
    ...(formulas ? [`${formulas} formula cell(s): only saved results are scanned/exported. Results may be stale; recalculate and save in Excel first.`] : []),
    ...(missing ? [`${missing} formula cell(s) without a cached result will be blank in the export.`] : []),
  ] };
}

/** Rebuild the package from reviewed values. Never copy original ZIP members. */
export async function writeXlsx(table: TableData, values: string[][][]): Promise<Uint8Array> {
  const zip = new Map<string, string>();
  zip.set('[Content_Types].xml', xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${table.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`));
  zip.set('_rels/.rels', xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`));
  zip.set('xl/workbook.xml', xml(`<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${table.sheets.map((_, i) => `<sheet name="Sheet ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`));
  zip.set('xl/_rels/workbook.xml.rels', xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${table.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`));
  table.sheets.forEach((sheet, si) => {
    const rows = values[si].map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => {
      const cell = sheet.rows[ri][ci];
      const ref = `${columnLabel(ci)}${ri + 1}`;
      if (value === cell.value && cell.scalar !== undefined) return `<c r="${ref}"${typeof cell.scalar === 'boolean' ? ' t="b"' : ''}><v>${typeof cell.scalar === 'boolean' ? Number(cell.scalar) : cell.scalar}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('')}</row>`).join('');
    zip.set(`xl/worksheets/sheet${si + 1}.xml`, xml(`<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`));
  });
  return writeZip(zip);
}
