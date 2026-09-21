import { getAudioLesson, getTranslationPages, saveAudio } from "../../../lib/storage";
import { getLanguageCode } from "../../../lib/languages";
import { sarvamVoicesV2, sarvamVoicesV3 } from "../../../lib/sarvam-voices";
import { gatewayFetch } from "../../../lib/function-gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

const voices = {
  "bulbul:v3": sarvamVoicesV3,
  "bulbul:v2": sarvamVoicesV2
};

function splitText(text, limit) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?\u0964]+[.!?\u0964]?/g) || [];
  const chunks = [];
  let chunk = "";
  for (const sentence of sentences) {
    const parts = sentence.trim().match(new RegExp(`.{1,${limit}}(?:\\s|$)`, "g")) || [sentence.trim()];
    for (const part of parts) {
      if (chunk && chunk.length + part.length + 1 > limit) { chunks.push(chunk); chunk = part.trim(); }
      else chunk += `${chunk ? " " : ""}${part.trim()}`;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wavData(buffer) {
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (name === "data") return { header: buffer.subarray(0, offset + 8), data: buffer.subarray(offset + 8, offset + 8 + size), sizeOffset: offset + 4 };
    offset += 8 + size + (size % 2);
  }
  throw new Error("Sarvam returned invalid WAV audio.");
}

function mergeWavs(buffers) {
  const parts = buffers.map(wavData);
  const header = Buffer.from(parts[0].header);
  const audio = Buffer.concat(parts.map((part) => part.data));
  header.writeUInt32LE(audio.length, parts[0].sizeOffset);
  header.writeUInt32LE(header.length + audio.length - 8, 4);
  return Buffer.concat([header, audio]);
}

async function synthesize(text, options) {
  const response = await gatewayFetch("sarvam/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language_code: options.languageCode, model: options.model, speaker: options.speaker, pace: options.pace, output_audio_codec: "wav" })
  });
  if (!response.ok) throw new Error(`Sarvam audio generation failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  if (!result.audios?.[0]) throw new Error("Sarvam returned no audio.");
  return Buffer.from(result.audios[0], "base64");
}

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams;
    const options = {
      materialId: query.get("materialId") || "",
      language: query.get("language") || "",
      sourceType: query.get("sourceType") || "",
      model: query.get("model") || "",
      speaker: query.get("speaker") || "",
      pace: Number(query.get("pace") || 1)
    };
    if (!getLanguageCode(options.language) || !["original", "translated"].includes(options.sourceType)) return Response.json({ error: "Invalid audio lesson." }, { status: 400 });
    const pages = await getAudioLesson(options);
    if (!pages.length) return Response.json({ error: "Audio lesson not found." }, { status: 404 });
    const audio = mergeWavs(pages.map((page) => page.data));
    const name = String(query.get("name") || "audio-lesson").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Content-Disposition": `attachment; filename="${name}-${options.sourceType}-${options.language}.wav"`
      }
    });
  } catch (error) {
    console.error("Audio download failed", error);
    return Response.json({ error: error.message || "Could not download audio." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { materialId, materialName, sourceType, lookupLanguage, language, startPage, endPage, model, speaker, pace } = await request.json();
    const first = Number(startPage);
    const last = Number(endPage);
    const speed = Number(pace);
    const safeLanguage = String(language || "").toLowerCase();
    if (!getLanguageCode(safeLanguage) || !voices[model]?.includes(speaker)) return Response.json({ error: "Choose a supported language, model, and voice." }, { status: 400 });
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last - first > 24) return Response.json({ error: "Choose a valid range of up to 25 pages." }, { status: 400 });
    if (!Number.isFinite(speed) || speed < .5 || speed > 2) return Response.json({ error: "Speed must be between 0.5x and 2x." }, { status: 400 });
    if (!["original", "translated"].includes(sourceType)) return Response.json({ error: "Choose original or translated content." }, { status: 400 });
    const pages = await getTranslationPages(String(materialId || ""), String(lookupLanguage || safeLanguage), first, last);
    if (!pages.length) return Response.json({ error: "No saved translated pages were found in this range." }, { status: 404 });
    const baseName = String(materialName || "lesson").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const saved = [];
    for (const page of pages) {
      const text = page.blocks?.map((block) => sourceType === "original" ? block.content : block.text).filter(Boolean).join(". ");
      if (!text) continue;
      const chunks = splitText(text, model === "bulbul:v3" ? 2400 : 1400);
      const audio = mergeWavs(await Promise.all(chunks.map((chunk) => synthesize(chunk, { languageCode: getLanguageCode(safeLanguage), model, speaker, pace: speed }))));
      const name = `${baseName}-${sourceType}-${safeLanguage}-page-${String(page.pageNumber).padStart(3, "0")}-${speaker}.wav`;
      await saveAudio({ materialId, language: safeLanguage, name, data: audio, contentType: "audio/wav", page: page.pageNumber, model, speaker, pace: speed, sourceType });
      saved.push({ name, page: page.pageNumber });
    }
    return Response.json({ saved }, { status: 201 });
  } catch (error) {
    console.error("Audio generation failed", error);
    return Response.json({ error: error.message || "Could not generate audio." }, { status: 500 });
  }
}
