import { applyToText } from '../core/transform';
import { baseName, extOf, type LoadedDoc, type Progress } from './types';

const TEXT_EXT = ['txt', 'md', 'json', 'log', 'xml', 'html', 'htm', 'eml', 'yaml', 'yml'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
export const ACCEPT = ['pdf', 'docx', 'xlsx', 'csv', 'tsv', ...IMAGE_EXT, ...TEXT_EXT].map((e) => `.${e}`).join(',');
export const FORMATS_LABEL = 'PDF · Word · Excel (.xlsx) · CSV/TSV · images · text';

export function textDoc(name: string, text: string): LoadedDoc {
  return {
    kind: 'text',
    name,
    text,
    visual: false,
    notes: [],
    async export(entities, replacer) {
      const out = applyToText(text, entities, replacer);
      return { blob: new Blob([out], { type: 'text/plain' }), filename: `${baseName(name)}.redacted.txt` };
    },
  };
}

export async function loadFile(file: File, opts: { forceOcr: boolean; signal?: AbortSignal }, progress: Progress): Promise<LoadedDoc> {
  const ext = extOf(file.name);
  if (['xlsx', 'csv', 'tsv'].includes(ext) && typeof Worker !== 'undefined') {
    progress('Reading spreadsheet locally…');
    return (await import('./table-client')).loadTableInWorker(file, opts.signal);
  }
  // Format handlers are loaded lazily; pdf.js and tesseract are large.
  if (ext === 'pdf' || file.type === 'application/pdf') return (await import('./pdf')).loadPdf(file, opts, progress);
  if (IMAGE_EXT.includes(ext) || (file.type.startsWith('image/') && file.type !== 'image/svg+xml')) return (await import('./image')).loadImage(file, progress);
  if (ext === 'docx') return (await import('./docx')).loadDocx(file);
  if (ext === 'xlsx') return (await import('./xlsx')).loadXlsx(file);
  if (['xls', 'xlsm', 'xlsb'].includes(ext)) throw new Error('Save a macro-free .xlsx copy in Excel first. Legacy and macro-enabled workbooks are not supported.');
  if (ext === 'csv' || ext === 'tsv') return (await import('./csv')).loadCsv(file);
  if (ext === 'doc') throw new Error('Legacy .doc files are not supported. Save it as .docx and try again.');
  if (TEXT_EXT.includes(ext) || file.type.startsWith('text/')) return textDoc(file.name, await file.text());
  throw new Error(`.${ext || '?'} files aren't supported yet. Supported: ${FORMATS_LABEL}.`);
}
