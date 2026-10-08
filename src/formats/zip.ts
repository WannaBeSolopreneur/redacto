import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** Entries of an unzipped Office package (DOCX/XLSX). */
export class ZipEntries {
  /** Every entry name in the archive, including ones that weren't extracted. */
  readonly names: string[];
  private readonly files: Map<string, Uint8Array>;

  constructor(names: string[], files: Map<string, Uint8Array>) {
    this.names = names;
    this.files = files;
  }

  has(name: string) {
    return this.names.includes(name);
  }

  bytes(name: string): Uint8Array | undefined {
    return this.files.get(name);
  }

  text(name: string): string | undefined {
    const b = this.files.get(name);
    return b && strFromU8(b);
  }

  /** Extracted entries, for re-packing. */
  entries() {
    return this.files.entries();
  }
}

/**
 * Unzip the entries `want` selects. Each entry is inflated into a buffer of its
 * declared size and never grows past it, so checking declared sizes up front
 * bounds memory even for a zip bomb that lies about them.
 */
export function readZip(
  data: Uint8Array,
  want: (name: string) => boolean,
  limits: { entry: number; total: number; message: string },
): ZipEntries {
  const names: string[] = [];
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        names.push(f.name);
        if (!want(f.name)) return false;
        total += f.originalSize;
        if (f.originalSize > limits.entry || total > limits.total) throw new RangeError(limits.message);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof RangeError) throw new Error(e.message);
    throw new Error('This file is damaged or is not a valid Office document.');
  }
  return new ZipEntries(names, new Map(Object.entries(files)));
}

/** Already-compressed media gain nothing from deflate; store them as-is. */
const STORED = /\.(png|jpe?g|gif|webp|emf|wmf|tiff?|mp[34]|zip|xlsx|docx|pdf)$/i;

export function writeZip(files: Iterable<[string, Uint8Array | string]>): Uint8Array {
  const out: Zippable = {};
  for (const [name, data] of files) {
    out[name] = [typeof data === 'string' ? strToU8(data) : data, { level: STORED.test(name) ? 0 : 6 }];
  }
  return zipSync(out);
}
