import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../core/types';
import { planTableScan, scanTable } from '../ml/table-scan';
import type { RunOptions } from '../ml/ner';
const gate = vi.hoisted(() => ({ next: null as Promise<void> | null }));

// Browser/ONNX inference is the slow boundary. Keep the scan planner, projection,
// document state, review controls and export gating real.
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock('../ml/ner', () => ({
  loadNer: async () => { loads.count++; return { loadMs: 1, threads: 1, isolated: false }; },
  cancelNer: () => {}, onNerProgress: () => () => {},
  runNer: async (_model: string, text: string, _overrides: unknown, _current: unknown, options?: RunOptions) => {
    const wait = gate.next; gate.next = null;
    if (wait) await wait;
    const infer = async (input: string): Promise<Entity[]> => {
      const start = input.indexOf('Zyra Okafor');
      return start < 0 ? [] : [{ start, end: start + 11, text: 'Zyra Okafor', type: 'PERSON', source: 'ml', score: 0.99 }];
    };
    const entities = options?.table
      ? await scanTable(planTableScan(options.table, options.known ?? [], options.headers), infer, options.onProgress)
      : await infer(text);
    return { entities, runMs: 1 };
  },
}));

import { activateModel, addFiles, canExport, clearAll, docView, redoReview, setHeaderRow, store, undoReview, updateSettings } from './app';

async function open(text: string) {
  addFiles([new File([text], 'people.csv')]);
  await vi.waitFor(() => expect(store.get().docs.at(-1)?.mlState).toBe('done'));
  return store.get().docs.at(-1)!;
}
const current = (id: string) => store.get().docs.find((d) => d.id === id)!;

describe('model activation', () => {
  it('loads nothing until the user activates the model; waiting documents are then scanned', async () => {
    clearAll(); updateSettings({ useML: true, mode: 'label', denyList: [], allowList: [] });
    loads.count = 0;
    addFiles([new File(['Zyra Okafor'], 'notes.csv')]);
    await vi.waitFor(() => expect(store.get().docs.at(-1)?.phase).toBe('ready'));
    await new Promise((r) => setTimeout(r, 50));
    expect(loads.count).toBe(0);
    expect(store.get().model.status).toBe('idle');
    expect(store.get().docs.at(-1)?.mlState).toBe('waiting');
    expect(canExport(store.get().docs.at(-1)!)).toBe(false);
    activateModel();
    await vi.waitFor(() => expect(store.get().docs.at(-1)?.mlState).toBe('done'));
    expect(loads.count).toBe(1);
  });
});

describe('spreadsheet model integration', () => {
  beforeEach(() => { clearAll(); updateSettings({ useML: true, mode: 'label', denyList: [], allowList: [] }); activateModel(); });

  it('routes CSV inference through the distinct-value scan and exposes its progress', async () => {
    const d = await open(Array.from({ length: 500 }, () => 'Zyra Okafor').join('\n'));
    expect(d.mlProgress).toMatchObject({ uniqueValues: 1, completedValues: 1, reusedCells: 499 });
    expect(docView(d, store.get().settings).active).toHaveLength(500);
    expect(canExport(d)).toBe(true);
  });

  it('rescans cells when disabling header rules, including undo and redo', async () => {
    const d = await open('Name\nZyra Okafor');
    expect(d.mlProgress?.ruleCoveredCells).toBe(1);
    setHeaderRow(d.id, 0, false);
    expect(canExport(current(d.id))).toBe(false);
    await vi.waitFor(() => expect(current(d.id).mlState).toBe('done'));
    expect(docView(current(d.id), store.get().settings).active.map((e) => e.text)).toEqual(['Zyra Okafor']);
    expect(current(d.id).mlProgress?.ruleCoveredCells).toBe(0);
    undoReview(d.id);
    await vi.waitFor(() => expect(current(d.id).mlState).toBe('done'));
    expect(current(d.id).mlProgress?.ruleCoveredCells).toBe(1);
    redoReview(d.id);
    await vi.waitFor(() => expect(current(d.id).mlState).toBe('done'));
    expect(docView(current(d.id), store.get().settings).active.map((e) => e.text)).toEqual(['Zyra Okafor']);
  });

  it('drops results and progress from a scan superseded by a header change', async () => {
    const d = await open('Name\nZyra Okafor');
    let finish!: () => void;
    gate.next = new Promise<void>((resolve) => { finish = resolve; });
    setHeaderRow(d.id, 0, false);
    await vi.waitFor(() => expect(gate.next).toBeNull());
    setHeaderRow(d.id, 0, true);
    await vi.waitFor(() => expect(current(d.id).mlState).toBe('done'));
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current(d.id).mlProgress?.ruleCoveredCells).toBe(1);
    expect(current(d.id).ml).toEqual([]);
    expect(canExport(current(d.id))).toBe(true);
  });
});
