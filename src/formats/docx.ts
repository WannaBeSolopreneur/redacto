import { baseName, type LoadedDoc } from './types';
import { readZip, writeZip, type ZipEntries } from './zip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;

interface Run {
  node: Element;
  start: number;
  end: number;
}

/**
 * DOCX redaction edits the text nodes in place, so formatting survives.
 * Entities can span several <w:t> runs; the replacement goes in the first run
 * and the remainder is removed from the others.
 */
export async function loadDocx(file: File): Promise<LoadedDoc> {
  // The export re-packs every part, so everything is extracted (bounded against zip bombs).
  const zip = readZip(new Uint8Array(await file.arrayBuffer()), () => true,
    { entry: 100_000_000, total: 300_000_000, message: 'This document is too large to process in the browser.' });
  const parts = new Map<string, Document>();
  const runs: Run[] = [];
  let text = '';

  const names = zip.names.filter((n) => TEXT_PARTS.test(n)).sort((a, b) =>
    a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b),
  );
  for (const name of names) {
    const xml = new DOMParser().parseFromString(zip.text(name)!, 'application/xml');
    parts.set(name, xml);
    for (const p of Array.from(xml.getElementsByTagNameNS(W, 'p'))) {
      // Both live text and tracked deletions (which still carry the old text).
      for (const t of Array.from(p.getElementsByTagNameNS('*', '*'))) {
        if (t.namespaceURI !== W || (t.localName !== 't' && t.localName !== 'delText')) continue;
        const s = t.textContent ?? '';
        runs.push({ node: t, start: text.length, end: text.length + s.length });
        text += s;
      }
      text += '\n';
    }
  }

  return {
    kind: 'docx',
    name: file.name,
    text,
    visual: false,
    notes: [
      'Author/company metadata and comment/revision authors are scrubbed.',
      'Images embedded in the document are not scanned.',
    ],
    async export(entities, replacer) {
      let ei = 0; // runs and entities are both sorted by offset
      for (const run of runs) {
        let out = '';
        for (let i = run.start; i < run.end; i++) {
          while (ei < entities.length && entities[ei].end <= i) ei++;
          const e = entities[ei];
          if (!e || i < e.start) out += text[i];
          else if (i === e.start) out += replacer.replace(e);
        }
        run.node.textContent = out;
        run.node.setAttribute('xml:space', 'preserve');
      }

      // Changed parts replace the originals in a fresh package; the loaded zip stays untouched.
      const changed = new Map<string, string>();
      const ser = new XMLSerializer();
      for (const [name, xml] of parts) {
        for (const el of Array.from(xml.getElementsByTagNameNS('*', '*'))) {
          if (el.hasAttributeNS(W, 'author')) el.setAttributeNS(W, 'w:author', 'Redacted');
          if (el.hasAttributeNS(W, 'initials')) el.setAttributeNS(W, 'w:initials', 'R');
        }
        changed.set(name, ser.serializeToString(xml));
      }
      scrubMetadata(zip, changed);

      // Restore originals so a later re-export with different choices works.
      for (const run of runs) run.node.textContent = text.slice(run.start, run.end);

      const files = [...zip.entries()].map(([name, data]): [string, Uint8Array | string] => [name, changed.get(name) ?? data]);
      const blob = new Blob([writeZip(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      return { blob, filename: `${baseName(file.name)}.redacted.docx` };
    },
  };
}

function scrubMetadata(zip: ZipEntries, changed: Map<string, string>) {
  const edit = (name: string, fn: (xml: string) => string) => {
    const xml = zip.text(name);
    if (xml !== undefined) changed.set(name, fn(xml));
  };
  edit('docProps/core.xml', (xml) => xml.replace(/<(dc:creator|cp:lastModifiedBy|dc:title|dc:subject|dc:description|cp:keywords)>[^<]*<\/\1>/g, '<$1></$1>'));
  edit('docProps/app.xml', (xml) => xml.replace(/<(Company|Manager)>[^<]*<\/\1>/g, '<$1></$1>'));
  edit('docProps/custom.xml', (xml) => xml.replace(/(<vt:lpwstr>)[^<]*(<\/vt:lpwstr>)/g, '$1$2'));
  edit('word/people.xml', (xml) => xml.replace(/w15:author="[^"]*"/g, 'w15:author="Redacted"').replace(/w15:userId="[^"]*"/g, 'w15:userId=""'));
}
