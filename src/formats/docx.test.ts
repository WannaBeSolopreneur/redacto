import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Replacer } from '../core/transform';
import type { Entity } from '../core/types';
import { loadDocx } from './docx';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function docx() {
  return new File([zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Patient Jane </w:t></w:r><w:r><w:t>Doe was seen.</w:t></w:r></w:p><w:p><w:ins w:author="Dr Smith" w:initials="DS"><w:r><w:t>Call 555-0100</w:t></w:r></w:ins></w:p></w:body></w:document>`),
    'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="c" xmlns:dc="d"><dc:creator>Dr Smith</dc:creator><cp:lastModifiedBy>Dr Smith</cp:lastModifiedBy></cp:coreProperties>'),
    'word/media/image1.png': PNG,
  }) as BlobPart], 'note.docx');
}

describe('DOCX', () => {
  beforeAll(() => {
    vi.stubGlobal('DOMParser', DOMParser);
    vi.stubGlobal('XMLSerializer', XMLSerializer);
  });

  it('redacts across runs, scrubs authors and metadata, and keeps other parts byte-for-byte', async () => {
    const doc = await loadDocx(docx());
    expect(doc.text).toBe('Patient Jane Doe was seen.\nCall 555-0100\n');
    const start = doc.text.indexOf('Jane Doe');
    const name: Entity = { start, end: start + 8, type: 'PERSON', text: 'Jane Doe', source: 'ml', score: 0.9 };
    const out = unzipSync(new Uint8Array(await (await doc.export([name], new Replacer('label'))).blob.arrayBuffer()));
    const body = strFromU8(out['word/document.xml']);
    expect(body).toContain('Patient [PERSON_1]');
    expect(body).not.toMatch(/Jane|Doe|Dr Smith|"DS"/);
    expect(strFromU8(out['docProps/core.xml'])).not.toContain('Smith');
    expect(out['word/media/image1.png']).toEqual(PNG);
    expect(out['[Content_Types].xml']).toBeDefined();
    // A second export with different choices starts from the original text.
    const again = unzipSync(new Uint8Array(await (await doc.export([], new Replacer('label'))).blob.arrayBuffer()));
    expect(strFromU8(again['word/document.xml'])).toContain('Jane ');
  });

  it('rejects a file that is not a zip', async () => {
    await expect(loadDocx(new File(['not a zip'], 'x.docx'))).rejects.toThrow(/damaged|valid/);
  });
});
