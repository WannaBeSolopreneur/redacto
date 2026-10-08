import { useSyncExternalStore } from 'react';

/** A minimal external store: state lives outside React, components subscribe to slices. */
export interface Store<T> {
  get(): T;
  set(fn: (s: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(fn) {
      const next = fn(state);
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** Subscribe to a slice. The selector must return an existing reference (no new objects/arrays). */
export function useSlice<T, U>(store: Store<T>, select: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
