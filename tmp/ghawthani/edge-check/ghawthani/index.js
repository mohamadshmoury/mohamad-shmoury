// supabase/functions/ghawthani/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.50.0";

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
async function createParticipantToken(idempotencyKey) {
  const secret = Deno.env.get("GH_A_ACCESS_SECRET");
  if (!secret || secret.length < 32) throw new Error("\u0633\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u062E\u0627\u0635 \u0628\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645.");
  return base64Url(await hmac(secret, `participant:${idempotencyKey}`));
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

// supabase/functions/ghawthani/index.ts
function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A Supabase \u0627\u0644\u062E\u0627\u062F\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function requireBoolean(body, key) {
  if (typeof body[key] !== "boolean") throw new Error("\u064A\u062C\u0628 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0635\u0631\u0627\u062D\u0629\u064B \u0639\u0646 \u062C\u0645\u064A\u0639 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u062D\u0636\u0648\u0631.");
  return body[key];
}
function safeSubmission(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    gender: row.gender,
    attended_day_1: row.attended_day_1,
    attended_day_2: row.attended_day_2,
    attended_day_3: row.attended_day_3,
    attendance_count: row.attendance_count,
    eligibility: row.eligibility,
    generation_status: row.generation_status,
    generation_error: row.generation_error,
    submitted_at: row.submitted_at
  };
}
async function findAuthorizedSubmission(client, id, token) {
  if (typeof id !== "string" || typeof token !== "string") throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  const accessHash = await sha256Hex(token);
  const { data, error } = await client.from("ghawthani_submissions").select("*").eq("id", id).eq("access_token_hash", accessHash).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628.");
  return data;
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse(new Error("\u0627\u0644\u0637\u0631\u064A\u0642\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629."), 405);
  try {
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "submit";
    const client = serviceClient();
    if (action === "status") {
      const submission2 = await findAuthorizedSubmission(client, body.submission_id, body.access_token);
      return jsonResponse({
        submission: safeSubmission(submission2),
        documents: await signedDocuments(client, submission2.id)
      });
    }
    if (action !== "submit") throw new Error("\u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645.");
    const fullName = cleanParticipantName(body.full_name);
    const gender = body.gender === "male" || body.gender === "female" ? body.gender : null;
    if (!gender) throw new Error("\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u062C\u0646\u0633.");
    const day1 = requireBoolean(body, "attended_day_1");
    const day2 = requireBoolean(body, "attended_day_2");
    const day3 = requireBoolean(body, "attended_day_3");
    if (body.acknowledged !== true) throw new Error("\u064A\u062C\u0628 \u062A\u0623\u0643\u064A\u062F \u0635\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0627\u0644\u0627\u0633\u0645 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644.");
    if (typeof body.idempotency_key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key)) {
      throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
    }
    const idempotencyHash = await sha256Hex(body.idempotency_key);
    const accessToken = await createParticipantToken(body.idempotency_key);
    const accessHash = await sha256Hex(accessToken);
    let submission = null;
    const { data: existing, error: existingError } = await client.from("ghawthani_submissions").select("*").eq("idempotency_key_hash", idempotencyHash).maybeSingle();
    if (existingError) throw existingError;
    submission = existing;
    if (!submission) {
      const { data: inserted, error: insertError } = await client.from("ghawthani_submissions").insert({
        full_name: fullName,
        gender,
        attended_day_1: day1,
        attended_day_2: day2,
        attended_day_3: day3,
        acknowledged: true,
        idempotency_key_hash: idempotencyHash,
        access_token_hash: accessHash
      }).select("*").single();
      if (insertError) {
        if (insertError.code !== "23505") throw insertError;
        const { data: raced, error: raceError } = await client.from("ghawthani_submissions").select("*").eq("idempotency_key_hash", idempotencyHash).single();
        if (raceError) throw raceError;
        submission = raced;
      } else {
        submission = inserted;
      }
    }
    if (submission.access_token_hash !== accessHash) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0633\u0627\u0628\u0642 \u0628\u0623\u0645\u0627\u0646.");
    if (!["completed", "not_required"].includes(submission.generation_status)) {
      try {
        await issueSubmissionDocuments(client, submission);
      } catch {
      }
    }
    const { data: refreshed, error: refreshError } = await client.from("ghawthani_submissions").select("*").eq("id", submission.id).single();
    if (refreshError) throw refreshError;
    return jsonResponse({
      submission: safeSubmission(refreshed),
      access_token: accessToken,
      documents: await signedDocuments(client, refreshed.id)
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
});
