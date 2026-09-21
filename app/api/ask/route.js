import { getMaterialFile, getPageKeywords } from "../../../lib/storage";
import { getLanguageCode, getLanguageName } from "../../../lib/languages";
import { analyzePdfBuffer } from "../../../lib/document-intelligence";
import { sarvamVoicesV3 } from "../../../lib/sarvam-voices";
import { gatewayFetch } from "../../../lib/function-gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

const documentCache = new Map();

const send = (controller, value) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`));

function detectLanguage(text) {
  if (/[\u0C80-\u0CFF]/u.test(text)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/u.test(text)) return "ml-IN";
  if (/[\u0B00-\u0B7F]/u.test(text)) return "od-IN";
  if (/[\u0A00-\u0A7F]/u.test(text)) return "pa-IN";
  if (/[\u0B80-\u0BFF]/u.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/u.test(text)) return "te-IN";
  if (/[\u0980-\u09FF]/u.test(text)) return "bn-IN";
  if (/[\u0A80-\u0AFF]/u.test(text)) return "gu-IN";
  if (/[\u0900-\u097F]/u.test(text)) return "hi-IN";
  return "en-IN";
}

async function transcribe(file) {
  const form = new FormData();
  const contentType = file.type.split(";")[0] || "audio/webm";
  form.set("file", new Blob([await file.arrayBuffer()], { type: contentType }), file.name || "question.webm");
  form.set("model", "saaras:v3");
  form.set("mode", "codemix");
  const response = await gatewayFetch("sarvam/stt", {
    method: "POST",
    body: form
  });
  if (!response.ok) throw new Error(`Speech recognition failed (${response.status}): ${await response.text()}`);
  return response.json();
}

async function getDocumentText(materialId, pageNumber) {
  const cacheKey = `${materialId}:${pageNumber}`;
  if (documentCache.has(cacheKey)) return documentCache.get(cacheKey);
  const promise = getMaterialFile(materialId).then(async ({ data, contentType }) => {
    if (contentType !== "application/pdf") throw new Error("AI Ask currently supports PDF materials.");
    const layout = await analyzePdfBuffer(data, pageNumber);
    const page = layout.pages[0];
    if (!page?.lines?.length) throw new Error("No readable text was found on this page.");
    return `[Page ${pageNumber}]\n${page.lines.map((line) => line.content).join(" ")}`;
  }).catch((error) => { documentCache.delete(cacheKey); throw error; });
  documentCache.set(cacheKey, promise);
  return promise;
}

async function streamAnswer(question, history, context, keywords, languageCode, onToken) {
  const response = await gatewayFetch("openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stream: true,
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: `You are Astra, a fast multilingual study assistant. The user's language is ${getLanguageName(languageCode)}. Answer in ${getLanguageName(languageCode)} using its native script. Use the PDF context for document questions and your general knowledge for other questions. Keep technical terms, acronyms, formulas, product names, exam keywords, and every mandatory term below in exact English inside every language. Never translate or transliterate those terms. When asked for a keyword meaning, begin with the actual English keyword followed by an em dash, then explain it in ${getLanguageName(languageCode)}. Be accurate, direct, and suitable for speech; stay under 140 words unless detail is requested. If a document answer is absent, say so clearly.\n\nMANDATORY ENGLISH TERMS:\n${keywords.join(", ") || "Infer technical and exam terms from the page."}\n\nPDF CONTEXT:\n${context}` },
        ...history.slice(-8).filter((item) => ["user", "assistant"].includes(item.role) && typeof item.content === "string"),
        { role: "user", content: question }
      ]
    })
  });
  if (!response.ok) throw new Error(`Azure Foundry failed (${response.status}): ${await response.text()}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
      if (token) { answer += token; onToken(token); }
    }
  }
  return answer.trim();
}

async function speak(text, languageCode, speaker, pace) {
  const response = await gatewayFetch("sarvam/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2400), language_code: languageCode, model: "bulbul:v3", speaker, pace, output_audio_codec: "wav" })
  });
  if (!response.ok) throw new Error(`Speech generation failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  return result.audios?.[0];
}

export async function POST(request) {
  const form = await request.formData();
  const materialId = String(form.get("materialId") || "");
  const pageNumber = Number(form.get("pageNumber"));
  const speaker = String(form.get("speaker") || "shubh");
  const pace = Number(form.get("pace") || 1);
  const audio = form.get("audio");
  const typedQuestion = String(form.get("question") || "").trim();
  let history = [];
  try { history = JSON.parse(String(form.get("history") || "[]")); } catch {}

  return new Response(new ReadableStream({
    async start(controller) {
      try {
        if (!materialId || !Number.isInteger(pageNumber) || pageNumber < 1) throw new Error("Choose a PDF page first.");
        if (!sarvamVoicesV3.includes(speaker)) throw new Error("Choose a supported voice.");
        if (!Number.isFinite(pace) || pace < .5 || pace > 2) throw new Error("Choose a valid speech pace.");
        let question = typedQuestion;
        let languageCode = detectLanguage(question);
        if (!question && audio instanceof File && audio.size) {
          send(controller, { type: "status", message: "Understanding your question..." });
          const result = await transcribe(audio);
          question = result.transcript?.trim();
          languageCode = getLanguageCode(result.language_code) || result.language_code || detectLanguage(question);
        }
        if (!question) throw new Error("No speech was detected. Please try again.");
        send(controller, { type: "transcript", text: question });
        send(controller, { type: "status", message: "Reading your PDF..." });
        const [context, keywords] = await Promise.all([getDocumentText(materialId, pageNumber), getPageKeywords(materialId, pageNumber)]);
        send(controller, { type: "answer_start" });
        const answer = await streamAnswer(question, history, context, keywords, languageCode, (token) => send(controller, { type: "delta", text: token }));
        if (!answer) throw new Error("Astra returned an empty answer.");
        send(controller, { type: "status", message: "Creating voice reply..." });
        const spokenAudio = await speak(answer, getLanguageCode(languageCode) || languageCode || "en-IN", speaker, pace);
        if (spokenAudio) send(controller, { type: "audio", audio: spokenAudio, mimeType: "audio/wav" });
        send(controller, { type: "done" });
      } catch (error) {
        console.error("AI Ask failed", error);
        send(controller, { type: "error", message: error.message || "AI Ask failed." });
      } finally {
        controller.close();
      }
    }
  }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
