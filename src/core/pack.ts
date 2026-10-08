import { ENTITY_TYPES, type Entity } from './types';

/**
 * Entities as typed arrays, for moving hundreds of thousands of them between a worker
 * and the page. The buffers transfer without copying; plain objects would be
 * structured-cloned one by one on the receiving (UI) thread.
 */
export interface PackedEntities {
  starts: Int32Array;
  ends: Int32Array;
  types: Uint8Array;
  sources: Uint8Array;
  scores: Float32Array;
}

const SOURCES = ['rule', 'ml', 'manual'] as const;

export function packEntities(entities: Entity[]): PackedEntities {
  const n = entities.length;
  const p: PackedEntities = {
    starts: new Int32Array(n), ends: new Int32Array(n), types: new Uint8Array(n), sources: new Uint8Array(n), scores: new Float32Array(n),
  };
  entities.forEach((e, i) => {
    p.starts[i] = e.start;
    p.ends[i] = e.end;
    p.types[i] = ENTITY_TYPES.indexOf(e.type);
    p.sources[i] = SOURCES.indexOf(e.source);
    p.scores[i] = e.score;
  });
  return p;
}

/** `text` must be the document text the offsets refer to; entity text is always that slice. */
export function unpackEntities(p: PackedEntities, text: string): Entity[] {
  const out = new Array<Entity>(p.starts.length);
  for (let i = 0; i < out.length; i++) {
    const start = p.starts[i], end = p.ends[i];
    // Float32 storage would turn 0.95 into 0.949999…; round back to the original precision.
    out[i] = { start, end, text: text.slice(start, end), type: ENTITY_TYPES[p.types[i]], source: SOURCES[p.sources[i]], score: Math.round(p.scores[i] * 1e4) / 1e4 };
  }
  return out;
}

export const packedBuffers = (p: PackedEntities) => [p.starts.buffer, p.ends.buffer, p.types.buffer, p.sources.buffer, p.scores.buffer];
