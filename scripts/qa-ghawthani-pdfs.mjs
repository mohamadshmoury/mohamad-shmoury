import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import reshaper from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';
import { PDFDocument, rgb } from 'pdf-lib';

const ROOT = resolve(import.meta.dirname, '..');
const outputDir = resolve(ROOT, 'tmp/ghawthani/qa');
const fontBytes = await readFile(resolve(ROOT, 'supabase/functions/_shared/assets/NotoNaskhArabic-Regular.ttf'));
const bidi = bidiFactory();
const { ArabicShaper } = reshaper;

const templates = [
  ['male', 'supabase/seed-assets/ghawthani/ijazah-male.pdf', { page_index: 0, page_width: 595.276, page_height: 851.7, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11 }],
  ['female', 'supabase/seed-assets/ghawthani/ijazah-female.pdf', { page_index: 0, page_width: 595.276, page_height: 851.7, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11 }],
  ['certificate', 'supabase/seed-assets/ghawthani/participation-certificate.pdf', { page_index: 0, page_width: 841.92, page_height: 595.2, name_x: 145, name_y: 382, name_width: 552, name_height: 50, font_size: 28, min_font_size: 14 }],
];
const names = [
  ['short', 'محمد علي حسن'],
  ['compound', 'عبد الله نور الدين محمد الغوثاني'],
  ['long', 'عبد الرحمن عبد الله محيي الدين بن محمد أحمد الغوثاني البقاعي'],
];

function visual(text) {
  const shaped = ArabicShaper.convertArabic(text);
  return bidi.getReorderedString(shaped, bidi.getEmbeddingLevels(shaped, 'rtl'));
}

function split(name) {
  const words = name.split(/\s+/u);
  if (words.length < 2) return [name];
  let best = [name];
  let delta = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const current = Math.abs(lines[0].length - lines[1].length);
    if (current < delta) { best = lines; delta = current; }
  }
  return best;
}

function layout(name, font, config) {
  for (const lines of [[name], split(name)]) {
    for (let size = config.font_size; size >= config.min_font_size; size -= 0.5) {
      const output = lines.map(visual);
      const lineHeight = size * 1.15;
      if (output.every((line) => font.widthOfTextAtSize(line, size) <= config.name_width) && output.length * lineHeight <= config.name_height) return { lines: output, size, lineHeight };
    }
  }
  throw new Error(`Name did not fit: ${name}`);
}

await mkdir(outputDir, { recursive: true });
for (const [templateName, relativePath, config] of templates) {
  const source = await readFile(resolve(ROOT, relativePath));
  for (const [nameKind, name] of names) {
    const pdf = await PDFDocument.load(source, { updateMetadata: false });
    pdf.registerFontkit(fontkit);
    const page = pdf.getPages()[config.page_index];
    const embeddedFont = await pdf.embedFont(fontBytes, { subset: true });
    const fitted = layout(name, embeddedFont, config);
    const totalHeight = fitted.lines.length * fitted.lineHeight;
    const firstBaseline = config.name_y + (config.name_height + totalHeight) / 2 - fitted.lineHeight * 0.82;
    fitted.lines.forEach((line, index) => {
      const width = embeddedFont.widthOfTextAtSize(line, fitted.size);
      page.drawText(line, { x: config.name_x + (config.name_width - width) / 2, y: firstBaseline - index * fitted.lineHeight, size: fitted.size, font: embeddedFont, color: rgb(0.09, 0.09, 0.09) });
    });
    const size = page.getSize();
    if (Math.abs(size.width - config.page_width) > 0.8 || Math.abs(size.height - config.page_height) > 0.8) throw new Error(`Dimension changed for ${templateName}`);
    const out = resolve(outputDir, `${templateName}-${nameKind}.pdf`);
    await writeFile(out, await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
    console.log(`${templateName}-${nameKind}: ${name.length} chars, ${fitted.lines.length} line(s), ${fitted.size} pt`);
  }
}
