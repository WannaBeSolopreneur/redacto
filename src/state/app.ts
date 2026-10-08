import { finalize, occurrences, resolveOverlaps } from '../core/detect';
import { detectDenyList, detectRules } from '../core/rules';
import { applyToText, occurrenceKey, Replacer, valueKey } from '../core/transform';
import { defaultSettings, ENTITY_TYPES, type Entity, type Settings } from '../core/types';
import { loadFile, textDoc } from '../formats';
import type { Area, ExportResult, LoadedDoc } from '../formats/types';
import { csvLiteral, tableEntities, tableStructural, type TableCell, type TableData } from '../formats/table';
import { classifyColumn } from '../formats/columns';
import { FALLBACK_MODEL, getModel, IS_PHONE, MODELS } from '../ml/models';
import { isModelDownloaded } from '../ml/cache';
import { loadNer, onNerProgress, runNer, type LoadInfo } from '../ml/ner';
import type { TableScanProgress } from '../ml/table-scan';
import { createStore } from './store';

/* ------------------------------------------------------------------ state */

export type ModelStatus = 'off' | 'idle' | 'loading' | 'ready' | 'error';

export interface ModelState {
  status: ModelStatus;
  /** The model actually in use; differs from settings.model after a fallback. */
  activeId: string | null;
  progress: number;
  startedAt: number | null;
  /** The model being loaded is already stored on this device (no download). */
  fromDevice: boolean;
  /** The user chose to turn the AI model on for this page. Nothing loads before that. */
  activated: boolean;
  info: LoadInfo | null;
  lastRunMs: number | null;
  notice: string | null;
  error: string | null;
}

/**
 * Model pass for one document. 'waiting'/'running' mean the output is still
 * rules-only (no names yet), so export is blocked until it settles.
 */
export type MlState = 'off' | 'waiting' | 'running' | 'done' | 'failed';

export interface Task {
  msg: string;
  fraction?: number;
}

export interface DocState {
  id: string;
  name: string;
  size: number;
  phase: 'reading' | 'ready' | 'error';
  progress: Task | null;
  error: string | null;
  doc: LoadedDoc | null;
  /** Rule, always-redact and structural candidates (unfiltered). */
  base: Entity[];
  /** Model candidates incl. propagated repeats (unfiltered). */
  ml: Entity[];
  mlState: MlState;
  mlError: string | null;
  mlProgress: TableScanProgress | null;
  manual: Entity[];
  /** Occurrences flipped from their value's state (see isOff). */
  excluded: ReadonlySet<string>;
  /** Values (type + normalised text) kept in the output everywhere. */
  excludedValues: ReadonlySet<string>;
  /** Rectangles drawn by hand on page images (signatures, photos…). */
  areas: Area[];
  exporting: Task | null;
  tableHeaders: boolean[];
  cellChoices: ReadonlyMap<string, boolean>;
  exportAcknowledged: boolean;
  ui: { tab: 'review' | 'output' | 'pages' | null; sheet: number; scrollTop: number; scrollLeft: number; gridTop: number; gridLeft: number; reveal: number | null };
  undo: ReviewSnapshot[];
  redo: ReviewSnapshot[];
}

type ReviewSnapshot = Pick<DocState, 'manual' | 'excluded' | 'excludedValues' | 'areas' | 'cellChoices' | 'tableHeaders'>;
const reviewSnapshot = (d: DocState): ReviewSnapshot => ({ manual: d.manual, excluded: d.excluded, excludedValues: d.excludedValues, areas: d.areas, cellChoices: d.cellChoices, tableHeaders: d.tableHeaders });

export interface AppState {
  settings: Settings;
  model: ModelState;
  docs: DocState[];
  selectedId: string | null;
  toast: { id: number; msg: string; kind: 'info' | 'error' } | null;
  /** Everything the app may need later is loaded, so it keeps working with the network off. */
  offlineReady: boolean;
}

const SETTINGS_KEY = 'redact-local.settings.v1';

function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    if (!saved || typeof saved !== 'object') return d;
    const enabled = { ...d.enabled };
    for (const t of ENTITY_TYPES) if (typeof saved.enabled?.[t] === 'boolean') enabled[t] = saved.enabled[t];
    return {
      ...d,
      enabled,
      mode: saved.mode === 'redact' || saved.mode === 'pseudonymize' || saved.mode === 'label' ? saved.mode : d.mode,
      useML: typeof saved.useML === 'boolean' ? saved.useML : d.useML,
      // A model saved as a mere default follows the device's default (phones changed to the smaller one).
      model: saved.modelChosen && MODELS.some((m) => m.id === saved.model) ? saved.model! : d.model,
      modelChosen: saved.modelChosen === true,
      // 0.6 was the old default under the old scoring; anything else was chosen by the user.
      minScore: typeof saved.minScore === 'number' && saved.minScore !== 0.6 ? Math.min(0.99, Math.max(0.3, saved.minScore)) : d.minScore,
      denyList: [],
      allowList: [],
      forceOcr: saved.forceOcr === true,
    };
  } catch {
    return d;
  }
}

function saveSettings(s: Settings) {
  try {
    const { denyList: _deny, allowList: _allow, ...preferences } = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    // Private mode / storage disabled: settings just don't persist.
  }
}

const initialSettings = loadSettings();
saveSettings(initialSettings); // Remove legacy persisted custom terms on startup.

export const store = createStore<AppState>({
  settings: initialSettings,
  model: {
    status: initialSettings.useML ? 'idle' : 'off',
    activeId: null,
    progress: 0,
    startedAt: null,
    fromDevice: false,
    activated: false,
    info: null,
    lastRunMs: null,
    notice: null,
    error: null,
  },
  docs: [],
  selectedId: null,
  toast: null,
  offlineReady: false,
});

const get = () => store.get();
const getDoc = (id: string) => get().docs.find((d) => d.id === id);

function setModel(patch: Partial<ModelState>) {
  store.set((s) => ({ ...s, model: { ...s.model, ...patch } }));
}

/** Patch a document; a no-op if it was removed meanwhile, so late async results are dropped. */
function patchDoc(id: string, fn: (d: DocState) => Partial<DocState> | null, recordReview = true) {
  store.set((s) => {
    let changed = false;
    const docs = s.docs.map((d) => {
      if (d.id !== id) return d;
      const p = fn(d);
      if (!p) return d;
      changed = true;
      const reviewChanged = recordReview && d.phase === 'ready' && ['manual', 'excluded', 'excludedValues', 'areas', 'cellChoices', 'tableHeaders'].some((k) => k in p);
      return { ...d, ...p, ...(reviewChanged ? { undo: [...d.undo.slice(-19), reviewSnapshot(d)], redo: [] } : {}) };
    });
    return changed ? { ...s, docs } : s;
  });
}

let toastSeq = 0;
export function notify(msg: string, kind: 'info' | 'error' = 'info') {
  store.set((s) => ({ ...s, toast: { id: ++toastSeq, msg, kind } }));
}
export function dismissToast() {
  store.set((s) => (s.toast ? { ...s, toast: null } : s));
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error: /, '');

/** Regex rules depend only on the text, so they run once per document. */
const ruleCache = new WeakMap<LoadedDoc, Entity[]>();

/** Rule, always-redact and structural (header-column) candidates. */
function baseFor(doc: LoadedDoc, denyList: string[], headers?: boolean[]): Entity[] {
  let rules = ruleCache.get(doc);
  if (!rules) ruleCache.set(doc, (rules = doc.rules ?? detectRules(doc.text)));
  const structural = doc.table ? tableStructural(doc.table, headers) : doc.structural ?? [];
  return [...rules, ...detectDenyList(doc.text, denyList), ...structural];
}

/* ------------------------------------------------------------------ derived */

export interface DocView {
  /** Everything detected (after settings filters), sorted, non-overlapping. */
  entities: Entity[];
  /** What will actually be replaced. */
  active: Entity[];
  isOff(e: Entity): boolean;
}

const EMPTY_VIEW: DocView = { entities: [], active: [], isOff: () => false };

/** valueKey() normalises text with a regex; findings are re-grouped on every review click, so cache it per entity. */
const valueKeys = new WeakMap<Entity, string>();
export function entityKey(e: Entity): string {
  let k = valueKeys.get(e);
  if (k === undefined) valueKeys.set(e, (k = valueKey(e)));
  return k;
}

/**
 * Two cache layers, so a review click on a 500k-cell sheet doesn't redo detection:
 * detections depend only on candidates + filter settings; review choices are merged on top.
 */
const detectedCache = new WeakMap<LoadedDoc, { base: Entity[]; ml: Entity[]; settings: Settings; entities: Entity[] }>();
const viewCache = new WeakMap<LoadedDoc, { snapshot: DocState; settings: Settings; view: DocView }>();

const sameFilters = (a: Settings, b: Settings) =>
  a === b || (a.enabled === b.enabled && a.minScore === b.minScore && a.allowList === b.allowList);

/** Filtered, non-overlapping detections, clipped to cells for tables. */
function detected(d: DocState, doc: LoadedDoc, settings: Settings): Entity[] {
  const hit = detectedCache.get(doc);
  if (hit && hit.base === d.base && hit.ml === d.ml && sameFilters(hit.settings, settings)) return hit.entities;
  const finalized = finalize([...d.base, ...d.ml], settings);
  // Clipping sorted, non-overlapping spans keeps them sorted and non-overlapping.
  const entities = doc.table ? tableEntities(doc.table, finalized) : finalized;
  detectedCache.set(doc, { base: d.base, ml: d.ml, settings, entities });
  return entities;
}

/** Spans of sorted `a` that overlap no span of sorted, non-overlapping `b`. O(n + m). */
function without(a: Entity[], b: Entity[]): Entity[] {
  if (!b.length) return a;
  let j = 0;
  return a.filter((e) => {
    while (j < b.length && b[j].end <= e.start) j++;
    return !(j < b.length && b[j].start < e.end);
  });
}

/** Merge two sorted, mutually non-overlapping lists. */
function merge(a: Entity[], b: Entity[]): Entity[] {
  if (!b.length) return a;
  const out: Entity[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) out.push(j >= b.length || (i < a.length && a[i].start < b[j].start) ? a[i++] : b[j++]);
  return out;
}

/** Cell lookup by occurrence key, built once per table. */
const cellIndexCache = new WeakMap<TableData, Map<string, { sheet: number; col: number; cell: TableCell }>>();
function cellIndex(table: TableData) {
  let index = cellIndexCache.get(table);
  if (!index) {
    index = new Map();
    table.sheets.forEach((sheet, si) => sheet.rows.forEach((row) => row.forEach((cell, ci) => {
      if (cell.value) index!.set(occurrenceKey(cell), { sheet: si, col: ci, cell });
    })));
    cellIndexCache.set(table, index);
  }
  return index;
}

/** Final entities for a document under the current settings. Memoised per (doc state, settings). */
export function docView(d: DocState, settings: Settings): DocView {
  if (!d.doc) return EMPTY_VIEW;
  const hit = viewCache.get(d.doc);
  if (hit && hit.settings === settings && sameReview(hit.snapshot, d)) return hit.view;
  const table = d.doc.table;
  // Manual spans beat detections.
  const manual = resolveOverlaps(table ? tableEntities(table, d.manual) : d.manual);
  let entities = merge(without(detected(d, d.doc, settings), manual), manual);
  if (table && d.cellChoices.size) {
    // Cell decisions override detections, including later model results.
    const index = cellIndex(table);
    const chosen: Entity[] = [];
    const overrides: Entity[] = [];
    for (const [key, choice] of d.cellChoices) {
      const at = index.get(key);
      if (!at) continue;
      const { cell, sheet, col } = at;
      const e: Entity = { start: cell.start, end: cell.end, text: cell.value,
        type: d.tableHeaders[sheet] ? classifyColumn(table.sheets[sheet].rows[0]?.[col]?.value ?? '') ?? 'CUSTOM' : 'CUSTOM', source: 'manual', score: 1 };
      chosen.push(e);
      if (choice) overrides.push(e);
    }
    const byStart = (a: Entity, b: Entity) => a.start - b.start;
    // Drop everything inside a decided cell, then add back the cells chosen for redaction.
    entities = merge(without(entities, chosen.sort(byStart)), overrides.sort(byStart));
  }
  // An occurrence is off if its value is off, unless the occurrence itself was flipped back (XOR).
  const { excluded, excludedValues } = d;
  const isOff = (e: Entity) => e.source !== 'manual' &&
    (excludedValues.size > 0 && excludedValues.has(entityKey(e))) !== (excluded.size > 0 && excluded.has(occurrenceKey(e)));
  const view = { entities, active: excluded.size || excludedValues.size ? entities.filter((e) => !isOff(e)) : entities, isOff };
  viewCache.set(d.doc, { snapshot: d, settings, view });
  return view;
}

/** Output is final only once the model pass has settled; before that names may still be missing. */
export const awaitingModel = (d: DocState) => d.mlState === 'waiting' || d.mlState === 'running';
export const canExport = (d: DocState) => d.phase === 'ready' && !awaitingModel(d) && !d.exporting &&
  ((d.mlState !== 'failed' && d.doc?.kind !== 'xlsx') || d.exportAcknowledged);

/** Redacted text (all formats), for the on-screen output preview. */
export function previewText(d: DocState, settings: Settings): string {
  if (!d.doc) return '';
  return applyToText(d.doc.text, docView(d, settings).active, new Replacer(settings.mode));
}

/* ------------------------------------------------------------------ model */

let modelGen = 0;
let modelLoad: { requested: string; promise: Promise<string> } | null = null;

onNerProgress((p) => {
  if (get().model.status === 'loading') setModel({ progress: p });
});

/**
 * Crash guard. A model load that runs the device out of memory kills the tab, and the reload would load the same
 * model and crash again. A marker is kept while a model loads; if a page starts and finds one, the last load never
 * finished, so this page uses the small model instead, or rules only if the small one was what died.
 */
const LOADING_KEY = 'redacto.modelLoading';
const crashedModel: string | null = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(LOADING_KEY) ?? 'null') as { id: string; at: number } | null;
    localStorage.removeItem(LOADING_KEY);
    return m && Date.now() - m.at < 15 * 60_000 ? m.id : null;
  } catch {
    return null;
  }
})();
/** Don't load a model on this page until the user asks (Retry): the small one crashed last time. */
let modelBlocked = crashedModel === FALLBACK_MODEL;
const crashNotice = crashedModel
  ? `${getModel(crashedModel).name} stopped the page last time, likely because this device ran low on memory.`
  : null;
// A normal close or navigation fires pagehide; a tab killed for memory doesn't. Only the latter should count.
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (modelLoad) markLoading(null); });
const markLoading = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LOADING_KEY, JSON.stringify({ id, at: Date.now() }));
    else localStorage.removeItem(LOADING_KEY);
  } catch {
    // Storage disabled: no crash guard, nothing else changes.
  }
};

/** Load the selected model (falling back to the fast one). Resolves to the id actually loaded. */
export function ensureModel(): Promise<string> {
  if (modelBlocked) {
    const msg = `${crashNotice} Only pattern-based detection is on. Choose Retry to try the AI model again.`;
    setModel({ status: 'error', error: msg });
    return Promise.reject(new Error(msg));
  }
  // After a crash, this page uses the small model, whatever was selected.
  const requested = crashedModel && crashedModel !== FALLBACK_MODEL ? FALLBACK_MODEL : get().settings.model;
  if (modelLoad?.requested === requested) return modelLoad.promise;
  const promise: Promise<string> = (async () => {
    setModel({ status: 'loading', progress: 0, startedAt: Date.now(), error: null, notice: null, info: null, activeId: null });
    const attempts = requested === FALLBACK_MODEL ? [requested] : [requested, FALLBACK_MODEL];
    const stale = () => modelLoad?.promise !== promise;
    let lastErr: unknown;
    for (const id of attempts) {
      try {
        setModel({ fromDevice: await isModelDownloaded(getModel(id)).catch(() => false) });
        markLoading(id);
        // One thread on phones: less memory, and multi-threaded WebAssembly has crashed iOS Safari.
        const info = await loadNer(id, IS_PHONE ? { threads: 1 } : undefined);
        markLoading(null);
        if (stale()) throw new Error('Model selection changed');
        setModel({
          status: 'ready',
          activeId: id,
          info,
          notice:
            id !== requested
              ? `${getModel(requested).name} failed to load, so ${getModel(id).name} is used instead.`
              : crashNotice && id !== get().settings.model
                ? `${crashNotice} ${getModel(id).name} is used instead. You can switch back in Settings.`
                : null,
        });
        return id;
      } catch (e) {
        markLoading(null);
        if (stale()) throw e;
        lastErr = e;
      }
    }
    setModel({ status: 'error', error: errorText(lastErr) });
    throw lastErr;
  })();
  modelLoad = { requested, promise };
  promise.catch(() => {
    if (modelLoad?.promise === promise) modelLoad = null;
  });
  return promise;
}

/** In-flight model pass per document; aborting it also stops the work inside the model worker. */
const modelRuns = new Map<string, AbortController>();

function cancelRun(id: string) {
  modelRuns.get(id)?.abort();
  modelRuns.delete(id);
}

async function runModel(id: string) {
  const d = getDoc(id);
  if (!d?.doc || d.mlState !== 'waiting') return;
  // Documents added before the model is activated wait for it; nothing loads by itself.
  if (!get().model.activated) return;
  cancelRun(id);
  const gen = modelGen;
  const request = new AbortController();
  modelRuns.set(id, request);
  const current = () => gen === modelGen && modelRuns.get(id) === request && !!getDoc(id);
  const text = d.doc.text;
  try {
    const modelId = await ensureModel();
    if (!current()) return;
    patchDoc(id, (cur) => (cur.mlState === 'waiting' ? { mlState: 'running' } : null));
    if (!getDoc(id)) return;
    const { enabled } = get().settings;
    const r = await runNer(modelId, text, undefined, current, {
      signal: request.signal,
      ...(d.doc.table ? {
        // A cell only skips the model when a rule already redacts all of it. A disabled
        // type (Organizations is off by default) redacts nothing, so those cells still get scanned.
        table: d.doc.table, known: d.base.filter((e) => enabled[e.type]), headers: d.tableHeaders,
        onProgress: (mlProgress: TableScanProgress) => { if (current()) patchDoc(id, () => ({ mlProgress })); },
      } : {}),
    });
    if (!current()) return;
    setModel({ lastRunMs: r.runMs });
    patchDoc(id, () => ({ ml: r.entities, mlState: 'done', mlError: null }));
  } catch (e) {
    if (!current()) return;
    console.error(e);
    patchDoc(id, () => ({ mlState: 'failed', mlError: errorText(e) }));
  } finally {
    if (modelRuns.get(id) === request) modelRuns.delete(id);
  }
}

/** Header changes expose cells previously covered by column rules. Scan them again. */
function restartTableModel(id: string) {
  cancelRun(id);
  patchDoc(id, (d) => d.doc?.table ? { ml: [], mlProgress: null, mlError: null, mlState: initialMlState(d.doc), exportAcknowledged: false } : null);
  void runModel(id);
}

/** Model or on/off changed: drop model results everywhere and redo them. */
function restartModel() {
  modelGen++;
  for (const id of [...modelRuns.keys()]) cancelRun(id);
  modelLoad = null;
  const { useML } = get().settings;
  setModel({ status: useML ? 'idle' : 'off', activeId: null, info: null, notice: null, error: null, progress: 0 });
  store.set((s) => ({
    ...s,
    docs: s.docs.map((d) =>
      d.phase === 'ready' ? { ...d, ml: [], mlProgress: null, mlError: null, mlState: initialMlState(d.doc!), exportAcknowledged: false } : d,
    ),
  }));
  if (!useML || !get().model.activated) return;
  void ensureModel().catch(() => {});
  for (const d of get().docs) void runModel(d.id);
}

/** Turn the AI model on: load the selected model, scan waiting documents, then prepare offline use. */
export function activateModel() {
  modelBlocked = false;
  setModel({ activated: true });
  if (get().settings.useML) restartModel();
  else updateSettings({ useML: true }); // restarts the model
  void prepareOffline();
}

export function retryModel() {
  activateModel();
}

/** Patterns only, no AI model. */
export function continueWithoutAI() {
  updateSettings({ useML: false });
  void prepareOffline();
}

let preparing: Promise<void> | null = null;
/** Fetch the rest of the app in the background so it keeps working if the network goes away. Runs once. */
function prepareOffline() {
  preparing ??= (async () => {
    if (get().settings.useML) await ensureModel().catch(() => {});
    try {
      await (await import('../offline')).warmForOffline();
      store.set((s) => ({ ...s, offlineReady: true }));
    } catch (e) {
      console.warn('Offline warm-up incomplete:', e);
    }
  })();
  return preparing;
}

const initialMlState = (doc: LoadedDoc): MlState =>
  get().settings.useML && /[\p{L}\p{N}]/u.test(doc.text) ? 'waiting' : 'off';

/** Warm the model up shortly after start so it's ready by the time a file is dropped. */
/**
 * Nothing heavy starts by itself: the user picks a model and activates it (or continues without AI).
 * Someone who chose patterns only last time gets the offline warm-up straight away.
 */
export function init() {
  if (!get().settings.useML) setTimeout(() => void prepareOffline(), 300);
}

/* ------------------------------------------------------------------ settings */

export function updateSettings(patch: Partial<Settings>) {
  const prev = get().settings;
  const next = { ...prev, ...patch };
  store.set((s) => ({ ...s, settings: next }));
  saveSettings(next);
  if (patch.denyList && patch.denyList.join('\n') !== prev.denyList.join('\n')) {
    store.set((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.doc ? { ...d, base: baseFor(d.doc, next.denyList, d.tableHeaders) } : d)),
    }));
  }
  if (next.model !== prev.model || next.useML !== prev.useML) restartModel();
}

export function resetSettings() {
  const d = defaultSettings();
  updateSettings(d);
}

/* ------------------------------------------------------------------ documents */

let docSeq = 0;
// Files are read one at a time: PDF rendering and OCR are memory- and CPU-heavy.
let readQueue: Promise<void> = Promise.resolve();
const lifetimes = new Map<string, AbortController>();

function blankDoc(name: string, size: number): DocState {
  return {
    id: `doc${++docSeq}`,
    name,
    size,
    phase: 'reading',
    progress: { msg: 'Waiting…' },
    error: null,
    doc: null,
    base: [],
    ml: [],
    mlState: 'off',
    mlError: null,
    mlProgress: null,
    manual: [],
    excluded: new Set(),
    excludedValues: new Set(),
    areas: [],
    exporting: null,
    tableHeaders: [],
    cellChoices: new Map(),
    exportAcknowledged: false,
    ui: { tab: null, sheet: 0, scrollTop: 0, scrollLeft: 0, gridTop: 0, gridLeft: 0, reveal: null },
    undo: [], redo: [],
  };
}

function attach(id: string, doc: LoadedDoc) {
  if (!getDoc(id)) {
    doc.dispose?.();
    return;
  }
  const tableHeaders = doc.table?.sheets.map((s) => s.headerRow) ?? [];
  patchDoc(id, () => ({
    phase: 'ready',
    progress: null,
    doc,
    tableHeaders,
    base: baseFor(doc, get().settings.denyList, tableHeaders),
    mlState: initialMlState(doc),
  }));
  void runModel(id);
}

function add(docs: DocState[]) {
  store.set((s) => ({ ...s, docs: [...s.docs, ...docs], selectedId: docs[0]?.id ?? s.selectedId }));
}

export function addFiles(files: File[]) {
  if (!files.length) return;
  const created = files.map((f) => blankDoc(f.name, f.size));
  add(created);
  files.forEach((file, i) => {
    const id = created[i].id;
    const controller = new AbortController();
    lifetimes.set(id, controller);
    readQueue = readQueue.then(async () => {
      if (!getDoc(id)) return;
      patchDoc(id, () => ({ progress: { msg: 'Opening…' } }));
      try {
        const doc = await loadFile(file, { forceOcr: get().settings.forceOcr, signal: controller.signal }, (msg, fraction) =>
          patchDoc(id, () => ({ progress: { msg, fraction } })),
        );
        attach(id, doc);
      } catch (e) {
        console.error(e);
        patchDoc(id, () => ({ phase: 'error', progress: null, error: errorText(e) }));
      }
    });
  });
}

export function addText(text: string, name = 'Pasted text') {
  const d = blankDoc(name, text.length);
  add([d]);
  attach(d.id, textDoc(name, text));
}

export function selectDoc(id: string) {
  store.set((s) => (s.selectedId === id ? s : { ...s, selectedId: id }));
}

export function removeDoc(id: string) {
  const s = get();
  const i = s.docs.findIndex((d) => d.id === id);
  if (i < 0) return;
  cancelRun(id);
  lifetimes.get(id)?.abort();
  lifetimes.delete(id);
  s.docs[i].doc?.dispose?.();
  const docs = s.docs.filter((d) => d.id !== id);
  const selectedId = s.selectedId === id ? (docs[i] ?? docs[i - 1] ?? null)?.id ?? null : s.selectedId;
  store.set((st) => ({ ...st, docs, selectedId }));
}

export function clearAll() {
  // Stop in-flight passes but keep the loaded model: the next document needn't reload it.
  modelGen++;
  for (const id of [...modelRuns.keys()]) cancelRun(id);
  for (const controller of lifetimes.values()) controller.abort();
  lifetimes.clear();
  readQueue = Promise.resolve();
  for (const d of get().docs) d.doc?.dispose?.();
  store.set((s) => ({ ...s, docs: [], selectedId: null, toast: null, settings: { ...s.settings, denyList: [], allowList: [] } }));
  saveSettings(get().settings);
}

export function updateDocUi(id: string, patch: Partial<DocState['ui']>) {
  patchDoc(id, (d) => ({ ui: { ...d.ui, ...patch } }));
}

export function acknowledgeExport(id: string, value: boolean) {
  patchDoc(id, () => ({ exportAcknowledged: value }));
}

export function setHeaderRow(id: string, sheet: number, value: boolean) {
  const before = getDoc(id)?.tableHeaders;
  patchDoc(id, (d) => {
    if (!d.doc?.table || !d.doc.table.sheets[sheet] || d.tableHeaders[sheet] === value) return null;
    const tableHeaders = [...d.tableHeaders];
    tableHeaders[sheet] = value;
    return { tableHeaders, base: baseFor(d.doc, get().settings.denyList, tableHeaders) };
  });
  if (before !== getDoc(id)?.tableHeaders) restartTableModel(id);
}

export function setCellRedacted(id: string, sheet: number, row: number, col: number, value: boolean) {
  patchDoc(id, (d) => {
    const cell = d.doc?.table?.sheets[sheet]?.rows[row]?.[col];
    if (!cell?.value) return null;
    const cellChoices = new Map(d.cellChoices);
    cellChoices.set(occurrenceKey(cell), value);
    return { cellChoices };
  });
}

export function setColumnRedacted(id: string, sheet: number, col: number, value: boolean) {
  patchDoc(id, (d) => {
    const rows = d.doc?.table?.sheets[sheet]?.rows;
    if (!rows) return null;
    const cellChoices = new Map(d.cellChoices);
    for (const row of rows.slice(d.tableHeaders[sheet] ? 1 : 0)) {
      const cell = row[col];
      if (cell?.value) cellChoices.set(occurrenceKey(cell), value);
    }
    return { cellChoices };
  });
}

/** Show an entity in the document view; the view scrolls to `reveal` and flashes it. */
export function revealEntity(id: string, start: number) {
  const d = getDoc(id);
  if (!d?.doc) return;
  const sheets = d.doc.table?.sheets;
  if (sheets) {
    // Sheets are laid out in offset order: the last sheet starting at or before `start` holds it.
    let sheet = 0;
    sheets.forEach((s, i) => { if ((s.rows[0]?.[0]?.start ?? Infinity) <= start) sheet = i; });
    updateDocUi(id, { tab: 'review', sheet, reveal: start });
  } else updateDocUi(id, { tab: d.doc.visual ? 'pages' : 'review', reveal: start });
}

/**
 * The replacement for every active entity, assigned in document order exactly as the
 * export does, so a view can render only the cells on screen and still show the same labels.
 */
const replacerCache = new WeakMap<Entity[], Map<Settings['mode'], Replacer>>();
export function outputReplacer(active: Entity[], mode: Settings['mode']): Replacer {
  let byMode = replacerCache.get(active);
  if (!byMode) replacerCache.set(active, (byMode = new Map()));
  let r = byMode.get(mode);
  if (!r) {
    r = new Replacer(mode);
    for (const e of active) r.replace(e);
    byMode.set(mode, r);
  }
  return r;
}

/* ------------------------------------------------------------------ review */

const flip = (set: ReadonlySet<string>, key: string) => {
  const n = new Set(set);
  if (!n.delete(key)) n.add(key);
  return n;
};

/** Click on one highlight: keep/redact that occurrence only (manual ones are removed). */
export function toggleOccurrence(id: string, e: Entity) {
  const d = getDoc(id);
  if (d?.cellChoices.has(occurrenceKey(e))) {
    patchDoc(id, (cur) => { const cellChoices = new Map(cur.cellChoices); cellChoices.set(occurrenceKey(e), false); return { cellChoices }; });
    return;
  }
  patchDoc(id, (d) =>
    e.source === 'manual'
      ? { manual: d.manual.filter((m) => !(m.start === e.start && m.end === e.end)) }
      : { excluded: flip(d.excluded, occurrenceKey(e)) },
  );
}

/** Keep (on=false) or redact (on=true) every occurrence of these values. Clears per-occurrence overrides. */
export function setValues(id: string, vks: string[], on: boolean) {
  patchDoc(id, (d) => {
    const keys = new Set(vks);
    const values = new Set(d.excludedValues);
    for (const vk of keys) {
      if (on) values.delete(vk);
      else values.add(vk);
    }
    const excluded = new Set(d.excluded);
    for (const e of docView(d, get().settings).entities) if (keys.has(entityKey(e))) excluded.delete(occurrenceKey(e));
    const cellChoices = new Map(d.cellChoices);
    if (!on) for (const e of docView(d, get().settings).entities) {
      if (keys.has(entityKey(e)) && cellChoices.has(occurrenceKey(e))) cellChoices.set(occurrenceKey(e), false);
    }
    return { excludedValues: values, excluded, cellChoices, manual: on ? d.manual : d.manual.filter((e) => !keys.has(valueKey(e))) };
  });
}

export function addArea(id: string, area: Area) {
  patchDoc(id, (d) => ({ areas: [...d.areas, area] }));
}

export function removeArea(id: string, index: number) {
  patchDoc(id, (d) => ({ areas: d.areas.filter((_, i) => i !== index) }));
}

/** Redact a selected span, and every other whole-word occurrence of the same text. */
export function addManual(id: string, start: number, end: number) {
  patchDoc(id, (d) => {
    if (!d.doc) return null;
    const text = d.doc.text.slice(start, end);
    const spans = occurrences(d.doc.text, text);
    if (!spans.some((s) => s.start === start && s.end === end)) spans.push({ start, end });
    const have = new Set(d.manual.map(occurrenceKey));
    const added: Entity[] = spans
      .filter((s) => !have.has(occurrenceKey(s)))
      .map((s) => ({ ...s, type: 'CUSTOM', text: d.doc!.text.slice(s.start, s.end), source: 'manual', score: 1 }));
    const excluded = new Set(d.excluded);
    for (const s of spans) excluded.delete(occurrenceKey(s));
    return { manual: [...d.manual, ...added], excluded };
  });
}

/** Undo every review decision on a document. */
export function resetReview(id: string) {
  patchDoc(id, () => ({ manual: [], excluded: new Set(), excludedValues: new Set(), areas: [], cellChoices: new Map() }));
}

function restoreReview(id: string, direction: 'undo' | 'redo') {
  const before = getDoc(id)?.tableHeaders;
  patchDoc(id, (d) => {
    const snapshot = d[direction].at(-1);
    if (!snapshot || !d.doc) return null;
    const other = direction === 'undo' ? 'redo' : 'undo';
    return { ...snapshot, [direction]: d[direction].slice(0, -1), [other]: [...d[other].slice(-19), reviewSnapshot(d)],
      // Only a header-row change alters the candidates.
      ...(snapshot.tableHeaders !== d.tableHeaders ? { base: baseFor(d.doc, get().settings.denyList, snapshot.tableHeaders) } : {}) };
  }, false);
  if (before !== getDoc(id)?.tableHeaders) restartTableModel(id);
}
export function undoReview(id: string) { restoreReview(id, 'undo'); }
export function redoReview(id: string) { restoreReview(id, 'redo'); }

/* ------------------------------------------------------------------ export */

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sameReview(a: DocState, b: DocState | undefined): boolean {
  return !!b && a.doc === b.doc && a.base === b.base && a.ml === b.ml && a.manual === b.manual &&
    a.excluded === b.excluded && a.excludedValues === b.excludedValues && a.areas === b.areas && a.cellChoices === b.cellChoices && a.tableHeaders === b.tableHeaders;
}

export async function exportDoc(id: string): Promise<ExportResult | null> {
  const d = getDoc(id);
  if (!d?.doc || !canExport(d)) return null;
  const { settings } = get();
  const { active } = docView(d, settings);
  patchDoc(id, () => ({ exporting: { msg: 'Preparing…' } }));
  try {
    const result = await d.doc.export(
      active,
      new Replacer(settings.mode),
      (msg, fraction) => patchDoc(id, () => ({ exporting: { msg, fraction } })),
      d.areas,
    );
    if (!sameReview(d, getDoc(id)) || get().settings !== settings) {
      if (getDoc(id)) notify('Review choices changed during export. Download again to include the latest changes.');
      return null;
    }
    return result;
  } finally {
    patchDoc(id, () => ({ exporting: null }));
  }
}

/** Resolves to true when a file was saved. */
export async function downloadDoc(id: string): Promise<boolean> {
  try {
    const r = await exportDoc(id);
    if (!r) return false;
    saveBlob(r.blob, r.filename);
    return true;
  } catch (e) {
    console.error(e);
    if (getDoc(id)) notify(`Couldn't export: ${errorText(e)}`, 'error');
    return false;
  }
}

export async function downloadAll() {
  const ready = get().docs.filter(canExport);
  const settings = get().settings;
  if (!ready.length) return;
  if (ready.length === 1) return void (await downloadDoc(ready[0].id));
  try {
    const { writeZip } = await import('../formats/zip');
    const files = new Map<string, Uint8Array>();
    for (const d of ready) {
      const r = await exportDoc(d.id);
      if (!r) return;
      let name = r.filename;
      for (let n = 2; files.has(name); n++) name = r.filename.replace(/(\.[^.]+)$/, ` (${n})$1`);
      files.set(name, new Uint8Array(await r.blob.arrayBuffer()));
    }
    const blob = new Blob([writeZip(files) as BlobPart], { type: 'application/zip' });
    if (get().settings !== settings || ready.some((d) => !sameReview(d, getDoc(d.id)))) {
      if (get().docs.length) notify('Documents changed during export. Download again to include the latest changes.');
      return;
    }
    saveBlob(blob, 'redacted-files.zip');
  } catch (e) {
    console.error(e);
    notify(`Couldn't export: ${errorText(e)}`, 'error');
  }
}

/** Original → replacement table. Only meaningful for label/pseudonymize modes. */
export function downloadKey(id: string) {
  const d = getDoc(id);
  if (!d?.doc) return;
  const { settings } = get();
  const replacer = new Replacer(settings.mode);
  for (const e of docView(d, settings).active) replacer.replace(e);
  const q = (v: string) => `"${csvLiteral(v).replace(/"/g, '""')}"`;
  const csv = ['type,original,replacement', ...replacer.mapping().map((m) => [m.type, m.original, m.replacement].map(q).join(','))].join('\n');
  saveBlob(new Blob([csv], { type: 'text/csv' }), `${d.name.replace(/\.[^.]+$/, '')}.key.csv`);
}
