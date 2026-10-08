export interface ModelChunk { offset: number; text: string }

/** Bounded, overlapping inputs with original character offsets and no truncation. */
export function* modelChunks(text: string, countTokens: (text: string) => number, maxTokens: number): Generator<ModelChunk> {
  const splitsPair = (at: number) => at > 0 && /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at] ?? '');
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 1200, text.length);
    if (splitsPair(end)) end--;
    const preferBreak = () => {
      if (end === text.length) return;
      const window = text.slice(start, end);
      const brk = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf(' '));
      if (brk > window.length / 2) end = start + brk + 1;
    };
    preferBreak();
    let count = countTokens(text.slice(start, end));
    while (count > maxTokens) {
      const length = end - start;
      if (length <= (text.codePointAt(start)! > 0xffff ? 2 : 1)) throw new Error('A character exceeds the model token limit');
      end = start + Math.max(1, Math.min(length - 1, Math.floor(length * maxTokens / count * 0.9)));
      if (splitsPair(end)) end--;
      if (end <= start) end = start + 2;
      preferBreak();
      count = countTokens(text.slice(start, end));
    }
    yield { offset: start, text: text.slice(start, end) };
    if (end === text.length) break;
    // Overlap only near the boundary; names on either side retain their context.
    let next = end - Math.min(80, Math.floor((end - start) / 4));
    if (splitsPair(next)) next--;
    start = next > start ? next : end;
  }
}
