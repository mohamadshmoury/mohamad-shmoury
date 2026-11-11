import { PDFDocument, PDFPage, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

export const ARABIC_FONT_FAMILIES = ['noto_naskh', 'amiri', 'aref_ruqaa'] as const;
export type ArabicFontFamily = typeof ARABIC_FONT_FAMILIES[number];

export interface NamePlacement {
  page_index: number;
  page_width: number;
  page_height: number;
  name_x: number;
  name_y: number;
  name_width: number;
  name_height: number;
  font_size: number;
  min_font_size: number;
  font_color: string;
  font_family: ArabicFontFamily;
  alignment: 'center' | 'right' | 'left';
}

interface FontkitGlyphPath {
  scale(x: number, y: number): FontkitGlyphPath;
  toSVG(): string;
}

interface FontkitGlyph {
  path: FontkitGlyphPath;
}

interface FontkitGlyphPosition {
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

interface ArabicOutlineFont {
  unitsPerEm: number;
  layout(text: string): {
    glyphs: FontkitGlyph[];
    positions: FontkitGlyphPosition[];
  };
}

export function cleanParticipantName(value: unknown) {
  if (typeof value !== 'string') throw new Error('يرجى إدخال الاسم.');
  const name = value.trim();
  if (name.length < 3 || name.length > 120) throw new Error('يجب أن يكون الاسم بين 3 و120 حرفًا.');
  if (/\p{Cc}|[\r\n\t]/u.test(name)) throw new Error('يحتوي الاسم على محارف غير مسموحة.');
  if (!/[\p{L}\p{M}]/u.test(name)) throw new Error('يجب أن يتضمن الاسم حروفًا.');
  return name;
}

function colorFromHex(hex: string) {
  const value = hex.replace('#', '');
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

function splitForTwoLines(name: string) {
  const words = name.split(/\s+/u);
  if (words.length < 2) return [name];
  let best = [name];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ');
    const second = words.slice(index).join(' ');
    const delta = Math.abs(first.length - second.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = [first, second];
    }
  }
  return best;
}

function lineWidthAtSize(font: ArabicOutlineFont, line: string, size: number) {
  const run = font.layout(line);
  const widthInFontUnits = run.positions.reduce((total, position) => total + position.xAdvance, 0);
  return widthInFontUnits * size / font.unitsPerEm;
}

function findLayout(name: string, font: ArabicOutlineFont, config: NamePlacement) {
  const candidates = [[name], splitForTwoLines(name)];
  for (let size = config.font_size; size >= config.min_font_size; size -= 0.5) {
    for (const logicalLines of candidates) {
      const lineHeight = size * 1.15;
      const fitsWidth = logicalLines.every((line) => lineWidthAtSize(font, line, size) <= config.name_width);
      const fitsHeight = logicalLines.length * lineHeight <= config.name_height;
      if (fitsWidth && fitsHeight) return { lines: logicalLines, size, lineHeight };
    }
  }
  throw new Error('الاسم طويل جدًا بالنسبة إلى مساحة القالب الحالية. يرجى ضبط موضع الاسم أو تقصيره دون الإخلال بصحته.');
}

function drawOutlinedLine(
  page: PDFPage,
  font: ArabicOutlineFont,
  line: string,
  x: number,
  baseline: number,
  size: number,
  color: ReturnType<typeof colorFromHex>,
) {
  const run = font.layout(line);
  const scale = size / font.unitsPerEm;
  let cursorX = x;

  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const path = glyph.path.scale(1, -1).toSVG();
    if (path) {
      // pdf-lib flips SVG paths vertically. Pre-flipping the font outline keeps
      // the font's native baseline direction while retaining fontkit's Arabic
      // contextual shaping and right-to-left visual glyph order.
      page.drawSvgPath(path, {
        x: cursorX + position.xOffset * scale,
        y: baseline + position.yOffset * scale,
        scale,
        color,
      });
    }
    cursorX += position.xAdvance * scale;
  });
}

export async function personalizePdf(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  participantName: string,
  config: NamePlacement,
) {
  const name = cleanParticipantName(participantName);
  const document = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const pages = document.getPages();
  const page = pages[config.page_index];
  if (!page) throw new Error('صفحة وضع الاسم غير موجودة في القالب.');
  const { width, height } = page.getSize();
  if (Math.abs(width - config.page_width) > 0.75 || Math.abs(height - config.page_height) > 0.75) {
    throw new Error('أبعاد القالب لا تطابق الإعداد المحفوظ.');
  }
  if (
    config.name_x < 0 || config.name_y < 0 ||
    config.name_x + config.name_width > width + 0.5 ||
    config.name_y + config.name_height > height + 0.5
  ) throw new Error('منطقة الاسم تقع خارج حدود الصفحة.');

  // pdf-lib/fontkit's embedded CID-font path is unreliable for these Arabic
  // fonts (subset output can be invisible in Chromium, while full embedding
  // loses joining). Drawing the fontkit-shaped glyph outlines is viewer-safe
  // and preserves the selected calligraphic font exactly.
  const font = fontkit.create(fontBytes) as ArabicOutlineFont;
  const layout = findLayout(name, font, config);
  const totalHeight = layout.lines.length * layout.lineHeight;
  const firstBaseline = config.name_y + (config.name_height + totalHeight) / 2 - layout.lineHeight * 0.82;
  const color = colorFromHex(config.font_color);

  layout.lines.forEach((line, index) => {
    const lineWidth = lineWidthAtSize(font, line, layout.size);
    const x = config.alignment === 'left'
      ? config.name_x
      : config.alignment === 'right'
        ? config.name_x + config.name_width - lineWidth
        : config.name_x + (config.name_width - lineWidth) / 2;
    drawOutlinedLine(
      page,
      font,
      line,
      x,
      firstBaseline - index * layout.lineHeight,
      layout.size,
      color,
    );
  });

  return new Uint8Array(await document.save({ useObjectStreams: false, addDefaultPage: false }));
}

export async function readBundledArabicFont(fontFamily: ArabicFontFamily = 'noto_naskh') {
  const filenames: Record<ArabicFontFamily, string> = {
    noto_naskh: 'NotoNaskhArabic-Regular.ttf',
    amiri: 'Amiri-Regular.ttf',
    aref_ruqaa: 'ArefRuqaa-Regular.ttf',
  };
  return await Deno.readFile(new URL(`./assets/${filenames[fontFamily]}`, import.meta.url));
}
