import type { Replacer } from '../core/transform';
import type { Entity } from '../core/types';
import type { CharBox } from './visual';
import type { TableData } from './table';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

/** A rendered page image, for visual formats. Box coordinates are in its pixel space. */
export interface PageImage {
  url: string;
  width: number;
  height: number;
}

export type Progress = (msg: string, fraction?: number) => void;

/** A user-drawn rectangle to black out (visual formats), in page-image pixels. */
export type Area = CharBox;

export interface LoadedDoc {
  kind: 'text' | 'pdf' | 'image' | 'docx' | 'csv' | 'xlsx';
  name: string;
  /** All extractable text; entity offsets refer to this. */
  text: string;
  /** Whether output is visual (black boxes) rather than text replacement. */
  visual: boolean;
  notes: string[];
  /** Detections derived from document structure (e.g. a "First Name" column), merged with rule hits. */
  structural?: Entity[];
  /** detectRules(text), when the loader already ran it off the UI thread. */
  rules?: Entity[];
  table?: TableData;
  /** Visual formats: page images plus where an entity sits on them. */
  pages?: PageImage[];
  boxes?(e: Entity): Map<number, CharBox[]>;
  export(entities: Entity[], replacer: Replacer, progress?: Progress, areas?: Area[]): Promise<ExportResult>;
  /** Free page images, parsers and workers held for this document. */
  dispose?(): void;
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

export function extOf(name: string) {
  return (name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
}
