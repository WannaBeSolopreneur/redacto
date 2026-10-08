import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCsv } from '../formats/csv';
import { defaultSettings } from '../core/types';
import { addFiles, clearAll, docView, exportDoc, selectDoc, setCellRedacted, setColumnRedacted, setHeaderRow, store, updateSettings, updateDocUi, undoReview, redoReview, setValues } from './app';
import { valueKey } from '../core/transform';

async function open(text: string) {
  addFiles([new File([text], 'people.csv')]);
  await vi.waitFor(() => expect(store.get().docs.at(-1)?.phase).toBe('ready'));
  return store.get().docs.at(-1)!;
}
const current = (id: string) => store.get().docs.find((d) => d.id === id)!;

describe('spreadsheet review sessions', () => {
  beforeEach(() => { clearAll(); updateSettings({ ...defaultSettings(), useML: false }); });

  it('redacts a column without changing the header and preserves choices when switching', async () => {
    const a = await open('Name,Code\nZyra,00123\nNori,00456');
    setColumnRedacted(a.id, 0, 1, true);
    updateDocUi(a.id, { sheet: 0, gridTop: 640, tab: 'output' });
    const b = await open('Notes\nhello');
    selectDoc(a.id);
    expect(current(a.id).ui.tab).toBe('output');
    expect(current(a.id).ui.gridTop).toBe(640);
    expect(docView(current(a.id), store.get().settings).active.map((e) => e.text)).toEqual(['Zyra', '00123', 'Nori', '00456']);
    expect(current(b.id).manual).toHaveLength(0);
    setColumnRedacted(a.id, 0, 1, false);
    expect(docView(current(a.id), store.get().settings).active.map((e) => e.text)).toEqual(['Zyra', 'Nori']);
  });

  it('can disable header-based detection and explicitly redact an individual cell', async () => {
    const a = await open('Name,Notes\nZyra,ordinary');
    setHeaderRow(a.id, 0, false);
    expect(docView(current(a.id), store.get().settings).active).toHaveLength(0);
    setCellRedacted(a.id, 0, 1, 1, true);
    expect(docView(current(a.id), store.get().settings).active.map((e) => e.text)).toEqual(['ordinary']);
  });

  it('discards an export when review decisions change while it is being prepared', async () => {
    const a = await open('Name\nZyra');
    let finish!: () => void;
    const pending = new Promise<void>((r) => { finish = r; });
    const doc = await loadCsv(new File(['Name\nZyra'], 'people.csv'));
    const original = doc.export;
    doc.export = async (...args) => { await pending; return original(...args); };
    store.set((s) => ({ ...s, docs: s.docs.map((d) => d.id === a.id ? { ...d, doc } : d) }));
    const exporting = exportDoc(a.id);
    setCellRedacted(a.id, 0, 1, 0, false);
    finish();
    expect(await exporting).toBeNull();
  });

  it('clear workspace drops documents and sensitive custom terms', async () => {
    await open('Name\nZyra');
    updateSettings({ denyList: ['secret client'], allowList: ['private name'] });
    clearAll();
    expect(store.get().docs).toHaveLength(0);
    expect(store.get().settings.denyList).toEqual([]);
    expect(store.get().settings.allowList).toEqual([]);
  });

  it('undoes and redoes column choices independently for each document', async () => {
    const a = await open('Code\n00123');
    setColumnRedacted(a.id, 0, 0, true);
    const b = await open('Notes\nordinary');
    undoReview(a.id);
    expect(docView(current(a.id), store.get().settings).active).toHaveLength(0);
    redoReview(a.id);
    expect(docView(current(a.id), store.get().settings).active.map((e) => e.text)).toEqual(['Code', '00123']);
    expect(current(b.id).undo).toHaveLength(0);
  });

  it('findings keep controls also work for manually redacted cells', async () => {
    const a = await open('Notes\nordinary');
    setCellRedacted(a.id, 0, 1, 0, true);
    const entity = docView(current(a.id), store.get().settings).active[0];
    setValues(a.id, [valueKey(entity)], false);
    expect(docView(current(a.id), store.get().settings).active).toHaveLength(0);
  });

  it('clearing while exporting cannot return an artifact', async () => {
    const a = await open('Name\nZyra');
    let finish!: () => void;
    const pending = new Promise<void>((r) => { finish = r; });
    const original = a.doc!.export;
    a.doc!.export = async (...args) => { await pending; return original(...args); };
    const exporting = exportDoc(a.id);
    clearAll(); finish();
    expect(await exporting).toBeNull();
  });

  it('retains the detected entity type when explicitly redacting its whole column', async () => {
    const a = await open('Name\nZyra');
    setColumnRedacted(a.id, 0, 0, true);
    expect(docView(current(a.id), store.get().settings).active[0].type).toBe('PERSON');
  });
});
