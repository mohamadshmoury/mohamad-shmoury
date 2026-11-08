import { PDFDocument, PDFFont, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

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
  alignment: 'center' | 'right' | 'left';
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

function findLayout(name: string, font: PDFFont, config: NamePlacement) {
  const candidates = [[name], splitForTwoLines(name)];
  for (let size = config.font_size; size >= config.min_font_size; size -= 0.5) {
    for (const logicalLines of candidates) {
      const lineHeight = size * 1.15;
      // pdf-lib delegates custom-font layout to fontkit, which performs Arabic
      // contextual shaping. Supplying presentation-form/reversed text here
      // would shape and reorder it a second time.
      const fitsWidth = logicalLines.every((line) => font.widthOfTextAtSize(line, size) <= config.name_width);
      const fitsHeight = logicalLines.length * lineHeight <= config.name_height;
      if (fitsWidth && fitsHeight) return { lines: logicalLines, size, lineHeight };
    }
  }
  throw new Error('الاسم طويل جدًا بالنسبة إلى مساحة القالب الحالية. يرجى ضبط موضع الاسم أو تقصيره دون الإخلال بصحته.');
}

export async function personalizePdf(
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
  participantName: string,
  config: NamePlacement,
) {
  const name = cleanParticipantName(participantName);
  const document = await PDFDocument.load(templateBytes, { updateMetadata: false });
  document.registerFontkit(fontkit);
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

  const font = await document.embedFont(fontBytes, { subset: true });
  const layout = findLayout(name, font, config);
  const totalHeight = layout.lines.length * layout.lineHeight;
  const firstBaseline = config.name_y + (config.name_height + totalHeight) / 2 - layout.lineHeight * 0.82;

  layout.lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, layout.size);
    const x = config.alignment === 'left'
      ? config.name_x
      : config.alignment === 'right'
        ? config.name_x + config.name_width - lineWidth
        : config.name_x + (config.name_width - lineWidth) / 2;
    page.drawText(line, {
      x,
      y: firstBaseline - index * layout.lineHeight,
      size: layout.size,
      font,
      color: colorFromHex(config.font_color),
    });
  });

  return new Uint8Array(await document.save({ useObjectStreams: false, addDefaultPage: false }));
}

export async function readBundledArabicFont() {
  return await Deno.readFile(new URL('./assets/NotoNaskhArabic-Regular.ttf', import.meta.url));
}
