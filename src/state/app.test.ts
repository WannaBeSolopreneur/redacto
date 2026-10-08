import { beforeEach, describe, expect, it } from 'vitest';
import { valueKey } from '../core/transform';
import { addManual, addText, clearAll, docView, previewText, setValues, store, toggleOccurrence, updateSettings } from './app';

const TEXT = 'Email ann@x.org or ann@x.org. Call (415) 555-0134.';

function current() {
  const s = store.get();
  const d = s.docs.find((x) => x.id === s.selectedId)!;
  return { d, view: docView(d, s.settings), settings: s.settings };
}

describe('document state', () => {
  beforeEach(() => {
    clearAll();
    updateSettings({ useML: false, mode: 'label', denyList: [], allowList: [] });
  });

  it('detects on open and previews the output', () => {
    addText(TEXT);
    const { d, view, settings } = current();
    expect(d.phase).toBe('ready');
    expect(d.mlState).toBe('off');
    expect(view.active.map((e) => e.type)).toEqual(['EMAIL', 'EMAIL', 'PHONE']);
    expect(previewText(d, settings)).toBe('Email [EMAIL_1] or [EMAIL_1]. Call [PHONE_1].');
  });

  it('keeps one occurrence, or a value everywhere', () => {
    addText(TEXT);
    let { d, view } = current();
    toggleOccurrence(d.id, view.entities[0]);
    ({ d, view } = current());
    expect(view.active.map((e) => e.start)).toEqual([view.entities[1].start, view.entities[2].start]);

    setValues(d.id, [valueKey(view.entities[0])], false);
    ({ d, view } = current());
    expect(view.active.map((e) => e.type)).toEqual(['PHONE']);
    // Turning the value back on clears the per-occurrence override too.
    setValues(d.id, [valueKey(view.entities[0])], true);
    ({ view } = current());
    expect(view.active).toHaveLength(3);
  });

  it('adds a manual selection everywhere and removes it on click', () => {
    addText('Project Falcon is late. Falcon budget: ok.');
    let { d, view } = current();
    addManual(d.id, 8, 14); // "Falcon"
    ({ d, view } = current());
    expect(view.active.map((e) => e.text)).toEqual(['Falcon', 'Falcon']);
    toggleOccurrence(d.id, view.active[0]);
    ({ view } = current());
    expect(view.active.map((e) => e.start)).toEqual([24]);
  });

  it('applies settings without re-running detection', () => {
    addText(TEXT);
    const before = current().d;
    updateSettings({ enabled: { ...store.get().settings.enabled, EMAIL: false } });
    const { d, view } = current();
    expect(d).toBe(before); // same document state: only the derived view changed
    expect(view.active.map((e) => e.type)).toEqual(['PHONE']);
    updateSettings({ enabled: { ...store.get().settings.enabled, EMAIL: true } });
  });

  it('re-runs rules when the always-redact list changes', () => {
    addText('Ship Falcon on Monday.');
    updateSettings({ denyList: ['falcon'] });
    const { view } = current();
    expect(view.active.map((e) => e.text)).toEqual(['Falcon']);
  });
});
