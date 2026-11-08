// supabase/functions/ghawthani-admin/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { PDFDocument as PDFDocument2 } from "npm:pdf-lib@1.17.1";

// supabase/functions/_shared/cors.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghawthani-admin",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}
function errorResponse(error, status = 400) {
  const message = error instanceof Error ? error.message : "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639.";
  return jsonResponse({ error: message }, status);
}

// supabase/functions/_shared/crypto.ts
var encoder = new TextEncoder();
function bytesToHex(bytes) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}
function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function createAdminToken() {
  const secret = Deno.env.get("GH_A_ADMIN_TOKEN_SECRET");
  if (!secret || secret.length < 32) throw new Error("\u0633\u0631 \u062C\u0644\u0633\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.");
  const payload = base64Url(encoder.encode(JSON.stringify({
    purpose: "ghawthani-admin",
    exp: Math.floor(Date.now() / 1e3) + 60 * 60 * 4,
    nonce: crypto.randomUUID()
  })));
  const signature = base64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}
async function verifyAdminToken(token) {
  const secret = Deno.env.get("GH_A_ADMIN_TOKEN_SECRET");
  if (!secret || !token) return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;
  const expectedSignature = base64Url(await hmac(secret, payload));
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return false;
  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    const decoded = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(paddedPayload), (char) => char.charCodeAt(0))
    ));
    return decoded.purpose === "ghawthani-admin" && Number(decoded.exp) > Date.now() / 1e3;
  } catch {
    return false;
  }
}
function constantTimeEqual(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] || 0) ^ (b[index % Math.max(b.length, 1)] || 0);
  }
  return mismatch === 0;
}

// supabase/functions/_shared/pdf.ts
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import reshaper from "npm:arabic-persian-reshaper@1.0.1";
import bidiFactory from "npm:bidi-js@1.0.3";
var bidi = bidiFactory();
var { ArabicShaper } = reshaper;
function cleanParticipantName(value) {
  if (typeof value !== "string") throw new Error("\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0627\u0633\u0645.");
  const name = value.trim();
  if (name.length < 3 || name.length > 120) throw new Error("\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0627\u0644\u0627\u0633\u0645 \u0628\u064A\u0646 3 \u0648120 \u062D\u0631\u0641\u064B\u0627.");
  if (/\p{Cc}|[\r\n\t]/u.test(name)) throw new Error("\u064A\u062D\u062A\u0648\u064A \u0627\u0644\u0627\u0633\u0645 \u0639\u0644\u0649 \u0645\u062D\u0627\u0631\u0641 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D\u0629.");
  if (!/[\p{L}\p{M}]/u.test(name)) throw new Error("\u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0636\u0645\u0646 \u0627\u0644\u0627\u0633\u0645 \u062D\u0631\u0648\u0641\u064B\u0627.");
  return name;
}
function visualArabic(text) {
  const shaped = ArabicShaper.convertArabic(text);
  const levels = bidi.getEmbeddingLevels(shaped, "rtl");
  return bidi.getReorderedString(shaped, levels);
}
function colorFromHex(hex) {
  const value = hex.replace("#", "");
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  );
}
function splitForTwoLines(name) {
  const words = name.split(/\s+/u);
  if (words.length < 2) return [name];
  let best = [name];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const delta = Math.abs(first.length - second.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = [first, second];
    }
  }
  return best;
}
function findLayout(name, font, config) {
  const candidates = [[name], splitForTwoLines(name)];
  for (const logicalLines of candidates) {
    for (let size = config.font_size; size >= config.min_font_size; size -= 0.5) {
      const visualLines = logicalLines.map(visualArabic);
      const lineHeight = size * 1.15;
      const fitsWidth = visualLines.every((line) => font.widthOfTextAtSize(line, size) <= config.name_width);
      const fitsHeight = logicalLines.length * lineHeight <= config.name_height;
      if (fitsWidth && fitsHeight) return { visualLines, size, lineHeight };
    }
  }
  throw new Error("\u0627\u0644\u0627\u0633\u0645 \u0637\u0648\u064A\u0644 \u062C\u062F\u064B\u0627 \u0628\u0627\u0644\u0646\u0633\u0628\u0629 \u0625\u0644\u0649 \u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u062D\u0627\u0644\u064A\u0629. \u064A\u0631\u062C\u0649 \u0636\u0628\u0637 \u0645\u0648\u0636\u0639 \u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u062A\u0642\u0635\u064A\u0631\u0647 \u062F\u0648\u0646 \u0627\u0644\u0625\u062E\u0644\u0627\u0644 \u0628\u0635\u062D\u062A\u0647.");
}
async function personalizePdf(templateBytes, fontBytes, participantName, config) {
  const name = cleanParticipantName(participantName);
  const document = await PDFDocument.load(templateBytes, { updateMetadata: false });
  document.registerFontkit(fontkit);
  const pages = document.getPages();
  const page = pages[config.page_index];
  if (!page) throw new Error("\u0635\u0641\u062D\u0629 \u0648\u0636\u0639 \u0627\u0644\u0627\u0633\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A \u0627\u0644\u0642\u0627\u0644\u0628.");
  const { width, height } = page.getSize();
  if (Math.abs(width - config.page_width) > 0.75 || Math.abs(height - config.page_height) > 0.75) {
    throw new Error("\u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0642\u0627\u0644\u0628 \u0644\u0627 \u062A\u0637\u0627\u0628\u0642 \u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u062D\u0641\u0648\u0638.");
  }
  if (config.name_x < 0 || config.name_y < 0 || config.name_x + config.name_width > width + 0.5 || config.name_y + config.name_height > height + 0.5) throw new Error("\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0627\u0633\u0645 \u062A\u0642\u0639 \u062E\u0627\u0631\u062C \u062D\u062F\u0648\u062F \u0627\u0644\u0635\u0641\u062D\u0629.");
  const font = await document.embedFont(fontBytes, { subset: true });
  const layout = findLayout(name, font, config);
  const totalHeight = layout.visualLines.length * layout.lineHeight;
  const firstBaseline = config.name_y + (config.name_height + totalHeight) / 2 - layout.lineHeight * 0.82;
  layout.visualLines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, layout.size);
    const x = config.alignment === "left" ? config.name_x : config.alignment === "right" ? config.name_x + config.name_width - lineWidth : config.name_x + (config.name_width - lineWidth) / 2;
    page.drawText(line, {
      x,
      y: firstBaseline - index * layout.lineHeight,
      size: layout.size,
      font,
      color: colorFromHex(config.font_color)
    });
  });
  return new Uint8Array(await document.save({ useObjectStreams: false, addDefaultPage: false }));
}
async function readBundledArabicFont() {
  return await Deno.readFile(new URL("./assets/NotoNaskhArabic-Regular.ttf", import.meta.url));
}

// supabase/functions/_shared/eligibility.ts
function expectedDocumentTypes(submission) {
  const count = Number(submission.attended_day_1) + Number(submission.attended_day_2) + Number(submission.attended_day_3);
  if (count === 0) return [];
  if (count < 3) return ["participation_certificate"];
  return ["participation_certificate", submission.gender === "male" ? "ijazah_male" : "ijazah_female"];
}

// supabase/functions/_shared/issuance.ts
var BUCKET = "ghawthani-private";
function placementFromTemplate(template) {
  return {
    page_index: Number(template.page_index),
    page_width: Number(template.page_width),
    page_height: Number(template.page_height),
    name_x: Number(template.name_x),
    name_y: Number(template.name_y),
    name_width: Number(template.name_width),
    name_height: Number(template.name_height),
    font_size: Number(template.font_size),
    min_font_size: Number(template.min_font_size),
    font_color: String(template.font_color),
    alignment: template.alignment
  };
}
async function issueSubmissionDocuments(client, submission) {
  const requiredTypes = expectedDocumentTypes(submission);
  if (requiredTypes.length === 0) {
    const { error } = await client.from("ghawthani_submissions").update({
      generation_status: "not_required",
      generation_error: null,
      generation_completed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", submission.id);
    if (error) throw error;
    return [];
  }
  await client.from("ghawthani_submissions").update({
    generation_status: "processing",
    generation_error: null,
    generation_started_at: (/* @__PURE__ */ new Date()).toISOString(),
    generation_completed_at: null
  }).eq("id", submission.id);
  try {
    const { data: existing, error: existingError } = await client.from("ghawthani_issued_documents").select("*").eq("submission_id", submission.id);
    if (existingError) throw existingError;
    const completedTypes = new Set((existing || []).filter((row) => row.generation_status === "issued").map((row) => row.document_type));
    const pendingTypes = requiredTypes.filter((type) => !completedTypes.has(type));
    if (pendingTypes.length > 0) {
      const { data: templates, error: templateError } = await client.from("ghawthani_template_versions").select("*").in("template_type", pendingTypes).eq("is_active", true).eq("is_validated", true);
      if (templateError) throw templateError;
      const byType = new Map((templates || []).map((template) => [template.template_type, template]));
      const missing = pendingTypes.filter((type) => !byType.has(type));
      if (missing.length) throw new Error(`\u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631 \u0623\u0648 \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644: ${missing.join(", ")}`);
      const fontBytes = await readBundledArabicFont();
      for (const documentType of pendingTypes) {
        const template = byType.get(documentType);
        const storagePath = `issued/${submission.id}/${documentType}.pdf`;
        const { data: issueRow, error: upsertError } = await client.from("ghawthani_issued_documents").upsert({
          submission_id: submission.id,
          document_type: documentType,
          template_version_id: template.id,
          generation_status: "processing",
          storage_bucket: BUCKET,
          storage_path: storagePath,
          generation_error: null
        }, { onConflict: "submission_id,document_type" }).select("*").single();
        if (upsertError) throw upsertError;
        try {
          const { data: templateBlob, error: downloadError } = await client.storage.from(template.storage_bucket).download(template.storage_path);
          if (downloadError || !templateBlob) throw downloadError || new Error("\u062A\u0639\u0630\u0631 \u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0642\u0627\u0644\u0628.");
          const output = await personalizePdf(
            new Uint8Array(await templateBlob.arrayBuffer()),
            fontBytes,
            submission.full_name,
            placementFromTemplate(template)
          );
          const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, output, {
            contentType: "application/pdf",
            cacheControl: "0",
            upsert: true
          });
          if (uploadError) throw uploadError;
          const { error: issuedError } = await client.from("ghawthani_issued_documents").update({
            generation_status: "issued",
            file_sha256: await sha256Hex(output),
            generation_error: null,
            issued_at: issueRow.issued_at || (/* @__PURE__ */ new Date()).toISOString()
          }).eq("id", issueRow.id);
          if (issuedError) throw issuedError;
        } catch (error) {
          await client.from("ghawthani_issued_documents").update({
            generation_status: "failed",
            generation_error: error instanceof Error ? error.message : "\u0641\u0634\u0644 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0645\u0633\u062A\u0646\u062F."
          }).eq("id", issueRow.id);
          throw error;
        }
      }
    }
    const { data: issuedRows, error: finalError } = await client.from("ghawthani_issued_documents").select("*").eq("submission_id", submission.id).in("document_type", requiredTypes);
    if (finalError) throw finalError;
    if (issuedRows?.length !== requiredTypes.length || issuedRows.some((row) => row.generation_status !== "issued")) {
      throw new Error("\u0644\u0645 \u064A\u0643\u062A\u0645\u0644 \u062A\u0648\u0644\u064A\u062F \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629.");
    }
    const { error: completeError } = await client.from("ghawthani_submissions").update({
      generation_status: "completed",
      generation_error: null,
      generation_completed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", submission.id);
    if (completeError) throw completeError;
    return issuedRows;
  } catch (error) {
    await client.from("ghawthani_submissions").update({
      generation_status: "failed",
      generation_error: error instanceof Error ? error.message : "\u0641\u0634\u0644 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A.",
      generation_completed_at: null
    }).eq("id", submission.id);
    throw error;
  }
}
async function signedDocuments(client, submissionId, expiresIn = 300) {
  const { data, error } = await client.from("ghawthani_issued_documents").select("id, document_type, generation_status, storage_bucket, storage_path, issued_at, template_version_id").eq("submission_id", submissionId).eq("generation_status", "issued").order("document_type");
  if (error) throw error;
  return await Promise.all((data || []).map(async (document) => {
    const { data: signed, error: signedError } = await client.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, expiresIn, { download: true });
    if (signedError) throw signedError;
    return { ...document, download_url: signed.signedUrl, expires_in: expiresIn };
  }));
}

// supabase/functions/ghawthani-admin/index.ts
var BUCKET2 = "ghawthani-private";
var TEMPLATE_TYPES = ["ijazah_male", "ijazah_female", "participation_certificate"];
var SUBMISSION_SELECT = `
  id, full_name, gender, attended_day_1, attended_day_2, attended_day_3,
  attendance_count, eligibility, generation_status, generation_error,
  generation_started_at, generation_completed_at, submitted_at, updated_at,
  documents:ghawthani_issued_documents(
    id, document_type, template_version_id, generation_status,
    storage_bucket, storage_path, file_sha256, generation_error, issued_at
  )
`;
function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Supabase \u0627\u0644\u062E\u0627\u062F\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function asNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`\u0642\u064A\u0645\u0629 ${label} \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.`);
  return number;
}
function placement(body, pageWidth, pageHeight, pageCount) {
  const config = {
    page_index: Math.trunc(asNumber(body.page_index, "\u0631\u0642\u0645 \u0627\u0644\u0635\u0641\u062D\u0629")),
    page_width: pageWidth,
    page_height: pageHeight,
    name_x: asNumber(body.name_x, "\u0627\u0644\u0645\u0648\u0636\u0639 \u0627\u0644\u0623\u0641\u0642\u064A"),
    name_y: asNumber(body.name_y, "\u0627\u0644\u0645\u0648\u0636\u0639 \u0627\u0644\u0639\u0645\u0648\u062F\u064A"),
    name_width: asNumber(body.name_width, "\u0639\u0631\u0636 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0627\u0633\u0645"),
    name_height: asNumber(body.name_height, "\u0627\u0631\u062A\u0641\u0627\u0639 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0627\u0633\u0645"),
    font_size: asNumber(body.font_size, "\u062D\u062C\u0645 \u0627\u0644\u062E\u0637"),
    min_font_size: asNumber(body.min_font_size, "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u0644\u062E\u0637"),
    font_color: typeof body.font_color === "string" ? body.font_color : "#171717",
    alignment: body.alignment === "left" || body.alignment === "right" ? body.alignment : "center"
  };
  if (config.page_index < 0 || config.page_index >= pageCount) throw new Error("\u0631\u0642\u0645 \u0635\u0641\u062D\u0629 \u0627\u0644\u0627\u0633\u0645 \u062E\u0627\u0631\u062C \u0646\u0637\u0627\u0642 \u0627\u0644\u0642\u0627\u0644\u0628.");
  if (config.name_x < 0 || config.name_y < 0 || config.name_width <= 0 || config.name_height <= 0) {
    throw new Error("\u0623\u0628\u0639\u0627\u062F \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0627\u0633\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
  }
  if (config.name_x + config.name_width > pageWidth + 0.5 || config.name_y + config.name_height > pageHeight + 0.5) {
    throw new Error("\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0627\u0633\u0645 \u062A\u062A\u062C\u0627\u0648\u0632 \u062D\u062F\u0648\u062F \u0627\u0644\u0635\u0641\u062D\u0629.");
  }
  if (config.font_size < 8 || config.font_size > 72 || config.min_font_size < 8 || config.min_font_size > config.font_size) {
    throw new Error("\u0623\u062D\u062C\u0627\u0645 \u0627\u0644\u062E\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(config.font_color)) throw new Error("\u0644\u0648\u0646 \u0627\u0644\u062E\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  return config;
}
function templateInsert(templateType, filename, storagePath, hash, pages, config) {
  return {
    template_type: templateType,
    original_filename: filename,
    storage_bucket: BUCKET2,
    storage_path: storagePath,
    file_sha256: hash,
    page_count: pages,
    ...config,
    is_validated: false,
    is_active: false
  };
}
function decodeBase64(value) {
  if (typeof value !== "string") throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0644\u0641 PDF \u0645\u0641\u0642\u0648\u062F\u0629.");
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0645\u0644\u0641 PDF \u0627\u0644\u0645\u0631\u0641\u0648\u0639.");
  }
  if (binary.length > 10 * 1024 * 1024) throw new Error("\u062D\u062C\u0645 \u0627\u0644\u0642\u0627\u0644\u0628 \u064A\u062A\u062C\u0627\u0648\u0632 10 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0648\u0639 \u0644\u064A\u0633 PDF \u0635\u0627\u0644\u062D\u064B\u0627.");
  return bytes;
}
async function signedTemplate(client, row) {
  const { data, error } = await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
  if (error) throw error;
  return { ...row, preview_url: data.signedUrl, preview_expires_in: 300 };
}
async function requireAdmin(request) {
  const token = request.headers.get("x-ghawthani-admin") || "";
  if (!await verifyAdminToken(token)) throw new Error("\u0627\u0646\u062A\u0647\u062A \u062C\u0644\u0633\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0623\u0648 \u0623\u0646\u0647\u0627 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
}
function requireAllowedOrigin(request) {
  const configured = Deno.env.get("GH_A_ALLOWED_ORIGINS");
  if (!configured) throw new Error("\u0646\u0637\u0627\u0642 \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.");
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = configured.split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new Error("\u0647\u0630\u0627 \u0627\u0644\u0646\u0637\u0627\u0642 \u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0647 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u063A\u0648\u062B\u0627\u0646\u064A.");
}
async function summary(client) {
  const [all, ijazah, certificate, failures] = await Promise.all([
    client.from("ghawthani_submissions").select("id", { count: "exact", head: true }),
    client.from("ghawthani_submissions").select("id", { count: "exact", head: true }).eq("eligibility", "ijazah_and_certificate"),
    client.from("ghawthani_submissions").select("id", { count: "exact", head: true }).eq("eligibility", "certificate_only"),
    client.from("ghawthani_submissions").select("id", { count: "exact", head: true }).eq("generation_status", "failed")
  ]);
  const error = [all, ijazah, certificate, failures].find((result) => result.error)?.error;
  if (error) throw error;
  return {
    submissions: all.count || 0,
    ijazah_eligible: ijazah.count || 0,
    certificate_only: certificate.count || 0,
    generation_failures: failures.count || 0
  };
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse(new Error("\u0627\u0644\u0637\u0631\u064A\u0642\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629."), 405);
  try {
    requireAllowedOrigin(request);
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "login") {
      const configuredCode = Deno.env.get("GH_A_ADMIN_CODE");
      const suppliedCode = typeof body.code === "string" ? body.code : "";
      if (!configuredCode || configuredCode.length < 12) throw new Error("\u0631\u0645\u0632 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0622\u0645\u0646 \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.");
      if (!constantTimeEqual(suppliedCode, configuredCode)) return errorResponse(new Error("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D."), 401);
      return jsonResponse({ token: await createAdminToken(), expires_in: 14400 });
    }
    await requireAdmin(request);
    const client = serviceClient();
    if (action === "summary") return jsonResponse({ summary: await summary(client) });
    if (action === "list_submissions") {
      const page = Math.max(1, Math.trunc(Number(body.page) || 1));
      const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(body.page_size) || 20)));
      let query = client.from("ghawthani_submissions").select(SUBMISSION_SELECT, { count: "exact" });
      if (typeof body.search === "string" && body.search.trim()) query = query.ilike("full_name", `%${body.search.trim().replace(/[%_,]/g, "")}%`);
      if (body.gender === "male" || body.gender === "female") query = query.eq("gender", body.gender);
      if (["none", "certificate_only", "ijazah_and_certificate"].includes(String(body.eligibility))) query = query.eq("eligibility", body.eligibility);
      if (["pending", "processing", "completed", "failed", "not_required"].includes(String(body.generation_status))) query = query.eq("generation_status", body.generation_status);
      if ([0, 1, 2, 3].includes(Number(body.attendance_count))) query = query.eq("attendance_count", Number(body.attendance_count));
      const from = (page - 1) * pageSize;
      const { data, count, error } = await query.order("submitted_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw error;
      return jsonResponse({ rows: data || [], count: count || 0, page, page_size: pageSize, summary: await summary(client) });
    }
    if (action === "submission_details") {
      const { data, error } = await client.from("ghawthani_submissions").select(SUBMISSION_SELECT).eq("id", body.submission_id).single();
      if (error) throw error;
      return jsonResponse({ submission: data });
    }
    if (action === "retry") {
      const { data: submission, error } = await client.from("ghawthani_submissions").select("*").eq("id", body.submission_id).single();
      if (error) throw error;
      if (submission.generation_status === "completed" || submission.generation_status === "not_required") {
        throw new Error("\u0644\u0627 \u064A\u062D\u062A\u0627\u062C \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649 \u0625\u0639\u0627\u062F\u0629 \u062A\u0648\u0644\u064A\u062F.");
      }
      await issueSubmissionDocuments(client, submission);
      const { data: refreshed, error: refreshedError } = await client.from("ghawthani_submissions").select(SUBMISSION_SELECT).eq("id", submission.id).single();
      if (refreshedError) throw refreshedError;
      return jsonResponse({ submission: refreshed });
    }
    if (action === "document_url") {
      const { data: document, error } = await client.from("ghawthani_issued_documents").select("*").eq("id", body.document_id).single();
      if (error) throw error;
      if (document.generation_status !== "issued") throw new Error("\u0627\u0644\u0645\u0633\u062A\u0646\u062F \u063A\u064A\u0631 \u062C\u0627\u0647\u0632 \u0644\u0644\u0639\u0631\u0636.");
      const { data: signed, error: signedError } = await client.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 300, { download: body.download === true });
      if (signedError) throw signedError;
      return jsonResponse({ url: signed.signedUrl, expires_in: 300 });
    }
    if (action === "list_templates") {
      const { data, error } = await client.from("ghawthani_template_versions").select("*").order("template_type").order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ templates: await Promise.all((data || []).map((row) => signedTemplate(client, row))) });
    }
    if (action === "upload_template") {
      const templateType = TEMPLATE_TYPES.includes(body.template_type) ? String(body.template_type) : null;
      if (!templateType) throw new Error("\u0646\u0648\u0639 \u0627\u0644\u0642\u0627\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
      const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 180) : "template.pdf";
      const bytes = decodeBase64(body.file_base64);
      let pdf;
      try {
        pdf = await PDFDocument2.load(bytes, { ignoreEncryption: false, updateMetadata: false });
      } catch {
        throw new Error("\u062A\u0639\u0630\u0631 \u0641\u062A\u062D PDF. \u062A\u0623\u0643\u062F \u0645\u0646 \u0623\u0646\u0647 \u063A\u064A\u0631 \u0645\u0634\u0641\u0651\u0631 \u0623\u0648 \u062A\u0627\u0644\u0641.");
      }
      const pages = pdf.getPages();
      if (!pages.length) throw new Error("\u0627\u0644\u0642\u0627\u0644\u0628 \u0644\u0627 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0635\u0641\u062D\u0627\u062A.");
      const pageIndex = Math.trunc(Number(body.page_index) || 0);
      const selectedPage = pages[pageIndex];
      if (!selectedPage) throw new Error("\u0635\u0641\u062D\u0629 \u0648\u0636\u0639 \u0627\u0644\u0627\u0633\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
      const size = selectedPage.getSize();
      const config = placement(body, size.width, size.height, pages.length);
      const id = crypto.randomUUID();
      const storagePath = `templates/${templateType}/${id}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET2).upload(storagePath, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await client.from("ghawthani_template_versions").insert(templateInsert(templateType, filename, storagePath, await sha256Hex(bytes), pages.length, config)).select("*").single();
      if (insertError) {
        await client.storage.from(BUCKET2).remove([storagePath]);
        throw insertError;
      }
      return jsonResponse({ template: await signedTemplate(client, inserted) });
    }
    if (action === "save_template_config") {
      const { data: current, error } = await client.from("ghawthani_template_versions").select("*").eq("id", body.template_id).single();
      if (error) throw error;
      const config = placement(body, Number(current.page_width), Number(current.page_height), Number(current.page_count));
      if (!current.is_active) {
        const { data: updated, error: updateError } = await client.from("ghawthani_template_versions").update({
          ...config,
          is_validated: false,
          validated_at: null,
          sample_storage_path: null,
          sample_generated_at: null
        }).eq("id", current.id).select("*").single();
        if (updateError) throw updateError;
        return jsonResponse({ template: await signedTemplate(client, updated), created_new_version: false });
      }
      const { data: blob, error: downloadError } = await client.storage.from(current.storage_bucket).download(current.storage_path);
      if (downloadError || !blob) throw downloadError || new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u062D\u0627\u0644\u064A.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const newId = crypto.randomUUID();
      const newPath = `templates/${current.template_type}/${newId}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET2).upload(newPath, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await client.from("ghawthani_template_versions").insert(templateInsert(
        current.template_type,
        current.original_filename,
        newPath,
        current.file_sha256,
        current.page_count,
        config
      )).select("*").single();
      if (insertError) {
        await client.storage.from(BUCKET2).remove([newPath]);
        throw insertError;
      }
      return jsonResponse({ template: await signedTemplate(client, inserted), created_new_version: true });
    }
    if (action === "generate_sample") {
      const sampleName = cleanParticipantName(body.sample_name || "\u0639\u0628\u062F \u0627\u0644\u0644\u0647 \u0645\u062D\u0645\u062F \u0627\u0644\u063A\u0648\u062B\u0627\u0646\u064A");
      const { data: template, error } = await client.from("ghawthani_template_versions").select("*").eq("id", body.template_id).single();
      if (error) throw error;
      const { data: blob, error: downloadError } = await client.storage.from(template.storage_bucket).download(template.storage_path);
      if (downloadError || !blob) throw downloadError || new Error("\u062A\u0639\u0630\u0631 \u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0642\u0627\u0644\u0628.");
      const output = await personalizePdf(new Uint8Array(await blob.arrayBuffer()), await readBundledArabicFont(), sampleName, template);
      const samplePath = `samples/${template.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await client.storage.from(BUCKET2).upload(samplePath, output, { contentType: "application/pdf", cacheControl: "0", upsert: false });
      if (uploadError) throw uploadError;
      const { error: sampleRecordError } = await client.from("ghawthani_template_versions").update({
        sample_storage_path: samplePath,
        sample_generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        is_validated: false,
        validated_at: null
      }).eq("id", template.id);
      if (sampleRecordError) throw sampleRecordError;
      if (template.sample_storage_path && template.sample_storage_path !== samplePath) {
        await client.storage.from(BUCKET2).remove([template.sample_storage_path]);
      }
      const { data: signed, error: signedError } = await client.storage.from(BUCKET2).createSignedUrl(samplePath, 600);
      if (signedError) throw signedError;
      return jsonResponse({ sample_url: signed.signedUrl, expires_in: 600, sample_name: sampleName });
    }
    if (action === "validate_template") {
      const { data: candidate, error: candidateError } = await client.from("ghawthani_template_versions").select("id, sample_storage_path, sample_generated_at").eq("id", body.template_id).single();
      if (candidateError) throw candidateError;
      if (!candidate.sample_storage_path || !candidate.sample_generated_at) throw new Error("\u064A\u062C\u0628 \u0625\u0646\u0634\u0627\u0621 \u0639\u064A\u0646\u0629 \u0645\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062D\u0627\u0644\u064A \u0642\u0628\u0644 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0642\u0627\u0644\u0628.");
      const { data, error } = await client.from("ghawthani_template_versions").update({ is_validated: true, validated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", body.template_id).select("*").single();
      if (error) throw error;
      return jsonResponse({ template: await signedTemplate(client, data) });
    }
    if (action === "activate_template") {
      const { data, error } = await client.rpc("ghawthani_activate_template", { target_id: body.template_id });
      if (error) throw error;
      return jsonResponse({ template: await signedTemplate(client, data) });
    }
    if (action === "participant_documents") {
      return jsonResponse({ documents: await signedDocuments(client, String(body.submission_id)) });
    }
    throw new Error("\u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645.");
  } catch (error) {
    const unauthorized = error instanceof Error && error.message.includes("\u062C\u0644\u0633\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629");
    return errorResponse(error, unauthorized ? 401 : 400);
  }
});
