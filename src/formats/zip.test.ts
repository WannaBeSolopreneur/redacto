import { execFileSync } from 'node:child_process';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

// Run the real Office ZIP reader in a killable process: a regression must fail
// this test rather than hang Vitest's own thread indefinitely.
function readInProcess(archive: Uint8Array): { names?: string[]; text?: string; error?: string } {
  const script = `
    import { readZip } from ${JSON.stringify(new URL('./zip.ts', import.meta.url).href)};
    console.log('reader ready');
    try {
      const zip = readZip(new Uint8Array(JSON.parse(process.argv[1])), () => true,
        { entry: 1000000, total: 2000000, message: 'Too large' });
      console.log(JSON.stringify({ names: zip.names, text: zip.text('word/document.xml') }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `;
  try {
    const output = execFileSync(process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e', script, JSON.stringify([...archive])],
      { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' });
    return JSON.parse(output.trim().split('\n').at(-1)!);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ETIMEDOUT'
      && 'stdout' in error && String(error.stdout).includes('reader ready')) {
      return { error: 'ZIP parser timed out' };
    }
    throw error;
  }
}

function zip64WithoutSizeExtraField(): Uint8Array {
  // One central-directory entry, ZIP64 end record, locator, and classic end
  // record. Its size sentinel requires extra field 0x0001, which is missing.
  const bytes = new Uint8Array(145);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, 0xffffffff, true);
  view.setUint16(28, 1, true);
  bytes[46] = 97; // filename "a"
  view.setUint32(47, 0x06064b50, true);
  view.setUint32(51, 44, true);
  view.setUint32(79, 1, true); // ZIP64 total entry count
  view.setUint32(87, 47, true); // central-directory size
  view.setUint32(103, 0x07064b50, true);
  view.setUint32(111, 47, true); // offset of ZIP64 end record
  view.setUint32(119, 1, true); // total disks
  view.setUint32(123, 0x06054b50, true);
  view.setUint16(131, 0xffff, true); // classic entry count sentinel
  view.setUint32(139, 0xffffffff, true); // classic directory offset sentinel
  return bytes;
}

describe('Office ZIP reader', () => {
  it('still extracts ordinary document XML', () => {
    const archive = zipSync({ 'word/document.xml': strToU8('<document>Jane Doe</document>') });
    expect(readInProcess(archive)).toEqual({
      names: ['word/document.xml'], text: '<document>Jane Doe</document>',
    });
  });

  it('rejects a ZIP64 size sentinel without its extra field instead of freezing', () => {
    expect(readInProcess(zip64WithoutSizeExtraField())).toEqual({
      error: 'This file is damaged or is not a valid Office document.',
    });
  });
});
