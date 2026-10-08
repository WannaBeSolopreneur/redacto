import { ocrInto } from './ocr';
import { baseName, type LoadedDoc, type Progress } from './types';
import { canvasToBlob, paintRects, TextMap } from './visual';

export async function loadImage(file: File, progress: Progress): Promise<LoadedDoc> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const draw = () => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas;
  };

  progress('Running OCR', 0);
  const map = new TextMap();
  await ocrInto(map, draw(), 1);
  progress('OCR complete', 1);
  const preview = draw();
  const pages = [{ url: URL.createObjectURL(await canvasToBlob(preview, 'image/jpeg', 0.9)), width: preview.width, height: preview.height }];

  return {
    kind: 'image',
    name: file.name,
    text: map.text,
    visual: true,
    notes: [
      'Text was found with OCR. Faces, signatures and handwriting are not detected; check the preview.',
      'Re-encoding strips EXIF metadata (GPS, camera, timestamps).',
    ],
    pages,
    boxes: (e) => map.rects([e]),
    async export(entities, _replacer, _progress, areas = []) {
      const canvas = draw();
      paintRects(canvas.getContext('2d')!, [...(map.rects(entities).get(1) ?? []), ...areas]);
      return { blob: await canvasToBlob(canvas, 'image/png'), filename: `${baseName(file.name)}.redacted.png` };
    },
    dispose() {
      URL.revokeObjectURL(pages[0].url);
      bitmap.close();
    },
  };
}
