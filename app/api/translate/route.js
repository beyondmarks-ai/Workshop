import { saveTranslation } from "../../../lib/storage";
import { getLanguageCode } from "../../../lib/languages";
import { analyzePdf } from "../../../lib/document-intelligence";
import { gatewayFetch } from "../../../lib/function-gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function protectKeywords(text, rules, protectedTerms, introducedTerms) {
  return rules.reduce((value, rule) => value.replace(
    new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(rule.term)}(?![A-Za-z0-9])`, "gi"),
    (match) => {
      const token = String.fromCodePoint(0xe000 + protectedTerms.length);
      const key = rule.term.toLowerCase();
      const replacement = rule.translation && !introducedTerms.has(key)
        ? `${rule.translation} (${match})`
        : match;
      introducedTerms.add(key);
      protectedTerms.push([token, replacement]);
      return token;
    }
  ), text);
}

function bounds(polygon) {
  const xs = polygon.filter((_, index) => index % 2 === 0);
  const ys = polygon.filter((_, index) => index % 2 === 1);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function pageBlocks(layout, page) {
  const figureBounds = (layout.figures || []).flatMap((figure) =>
    figure.boundingRegions.filter((region) => region.pageNumber === page.pageNumber).map((region) => bounds(region.polygon))
  );
  const paragraphs = (layout.paragraphs || []).filter((paragraph) =>
    paragraph.boundingRegions?.some((region) => region.pageNumber === page.pageNumber)
  );

  return paragraphs.map((paragraph) => {
    const polygon = paragraph.boundingRegions.find((region) => region.pageNumber === page.pageNumber).polygon;
    const box = bounds(polygon);
    const centerX = (box.left + box.right) / 2;
    const centerY = (box.top + box.bottom) / 2;
    const insideFigure = figureBounds.some((figure) =>
      centerX >= figure.left && centerX <= figure.right && centerY >= figure.top && centerY <= figure.bottom
    );
    const lineCount = page.lines.filter((line) => {
      const lineBox = bounds(line.polygon);
      const x = (lineBox.left + lineBox.right) / 2;
      const y = (lineBox.top + lineBox.bottom) / 2;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }).length;
    return { content: paragraph.content, polygon, role: paragraph.role || "body", lineCount: Math.max(1, lineCount), insideFigure };
  }).filter((paragraph) => !paragraph.insideFigure && paragraph.role !== "pageNumber");
}

async function detectImportantTerms(lines, target) {
  const text = lines.map((line) => line.content).join("\n").slice(0, 12000);
  const fallback = [...new Set([
    ...(text.match(/\b[A-Z][A-Z0-9+.-]{1,}\b/g) || []),
    ...(text.match(/\b[A-Z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+\b/g) || [])
  ])];
  const genericHeading = /^(chapter|introduction|background|abstract|conclusion|references|overview)(?:\s+\d+(?:\.\d+)*)?$/i;
  try {
    const response = await gatewayFetch("openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `Return JSON only as {"keep_english":string[],"bilingual":[{"term":string,"translation":string}]}. The reader studies in ${target} but writes exam answers in English. keep_english is only for standalone acronyms, formulas, units, standards, and exact product, model, API, framework, or programming-language names. Put exam-worthy academic concepts in bilingual, including a multiword concept that contains an acronym; for example, "generative AI" is bilingual while "AI" is keep_english. Each term must be an exact English substring and each translation a short natural ${target} meaning. Select at most 25 terms total. Exclude generic headings, sentences, descriptive phrases, and ordinary nouns or verbs such as user, student, answer, download, device, cost, control, identity, or file. Do not put a term in both lists.`
          },
          { role: "user", content: text }
        ],
        max_completion_tokens: 500,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) return { keepEnglish: fallback, bilingual: [] };
    const result = await response.json();
    const detected = JSON.parse(result.choices[0].message.content);
    const isValidTerm = (term) => typeof term === "string" && /[A-Za-z]/.test(term) && term.length < 100
      && text.toLowerCase().includes(term.toLowerCase()) && !genericHeading.test(term.trim());
    const keepEnglish = [...new Set([
      ...fallback,
      ...(Array.isArray(detected.keep_english) ? detected.keep_english : []).filter(isValidTerm)
    ])].sort((a, b) => b.length - a.length);
    const kept = new Set(keepEnglish.map((term) => term.toLowerCase()));
    const bilingual = (Array.isArray(detected.bilingual) ? detected.bilingual : [])
      .filter(({ term, translation }) => isValidTerm(term) && typeof translation === "string" && translation.trim() && !kept.has(term.toLowerCase()))
      .filter(({ term }, index, terms) => terms.findIndex((item) => item.term.toLowerCase() === term.toLowerCase()) === index)
      .map(({ term, translation }) => ({ term, translation: translation.trim() }));
    return { keepEnglish, bilingual };
  } catch {
    return { keepEnglish: fallback, bilingual: [] };
  }
}

async function translateLines(lines, source, target, rules) {
  const protectedTerms = [];
  const introducedTerms = new Set();
  const tasks = lines.flatMap((line, index) => {
    const words = protectKeywords(line.content, rules, protectedTerms, introducedTerms).split(/\s+/);
    const parts = [];
    let part = "";
    for (const word of words) {
      if (part && part.length + word.length + 1 > 700) { parts.push(part); part = word; }
      else part += `${part ? " " : ""}${word}`;
    }
    if (part) parts.push(part);
    return parts.map((input, partIndex) => ({ index, partIndex, input }));
  });
  const translations = lines.map(() => []);
  let cursor = 0;
  const translate = async ({ index, partIndex, input }) => {
    const response = await gatewayFetch("sarvam/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        source_language_code: getLanguageCode(source),
        target_language_code: getLanguageCode(target),
        mode: "formal",
        model: "mayura:v1",
        enable_preprocessing: false
      })
    });
    if (!response.ok) throw new Error(`Sarvam translation failed: ${await response.text()}`);
    const { translated_text: translatedText } = await response.json();
    translations[index][partIndex] = translatedText.trim();
  };
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      await translate(task);
    }
  }));

  return translations.map((parts, index) => {
    let restored = parts.filter(Boolean).join(" ") || lines[index].content;
    for (const [token, keyword] of protectedTerms) restored = restored.replaceAll(token, keyword);
    return restored;
  });
}

async function translateWithAzure(lines, target, rules, drafts) {
  try {
    const messages = [
      {
        role: "system",
        content: `Return JSON only as {"translations":string[]}. Post-edit each ${target} draft using its matching English source and the glossary. Keep the draft's natural ${target} sentence structure and return exactly one complete block per input in the same order. Preserve every clause, parenthetical detail, number, and paragraph; do not summarize. Use no English outside the glossary. Every glossary term present in a source block must occur verbatim in that output block. keepEnglish terms remain in exact English spelling. Bilingual terms appear as "target meaning (exact English term)" on their first occurrence in the page, then as the exact English term later. When a bilingual term is followed by an acronym in parentheses, format it as "target meaning (English term, ACRONYM)" without nested parentheses. Never translate, transliterate, omit, or alter required English text.`
      },
      { role: "user", content: JSON.stringify({
        glossary: rules.map(({ term, translation }) => translation
          ? { term, mode: "bilingual", firstUse: `${translation} (${term})`, laterUse: term }
          : { term, mode: "keepEnglish" }),
        blocks: lines.map(({ content }, index) => ({ source: content, draft: drafts[index] }))
      }) }
    ];
    const complete = async (requestMessages) => {
      const body = JSON.stringify({
        messages: requestMessages,
        max_completion_tokens: 2500,
        response_format: { type: "json_object" }
      });
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await gatewayFetch("openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        });
        if (response.ok || (response.status !== 429 && response.status < 500)) break;
        await wait(1500 * (attempt + 1));
      }
      if (!response.ok) return null;
      const result = await response.json();
      const translations = JSON.parse(result.choices[0].message.content).translations;
      return Array.isArray(translations) && translations.length === lines.length
        && translations.every((text) => typeof text === "string" && text.trim())
        ? translations.map((text) => text.trim())
        : null;
    };
    let translations = await complete(messages);
    if (!translations) return null;
    const missing = lines.map((line, index) => ({
      block: index + 1,
      terms: rules.filter(({ term }) => line.content.toLowerCase().includes(term.toLowerCase())
        && !translations[index].toLowerCase().includes(term.toLowerCase())).map(({ term }) => term)
    })).filter(({ terms }) => terms.length);
    if (missing.length) {
      translations = await complete([
        ...messages,
        { role: "assistant", content: JSON.stringify({ translations }) },
        { role: "user", content: `Correct the full result. These mandatory glossary terms are missing: ${JSON.stringify(missing)}. Insert each exact term in its matching block using the glossary format, preserve all content, and return the complete JSON again.` }
      ]) || translations;
    }
    const completed = translations.map((text, index) => {
      if (text.trim().toLowerCase() !== lines[index].content.trim().toLowerCase()) return text;
      const number = lines[index].content.match(/^\d+(?:\.\d+)*\s+/)?.[0] || "";
      return number && !drafts[index].startsWith(number) ? `${number}${drafts[index]}` : drafts[index];
    });
    const introduced = new Set();
    return completed.map((text, index) => rules.reduce((value, rule) => {
      const key = rule.term.toLowerCase();
      if (!lines[index].content.toLowerCase().includes(key)) return value;
      const firstUse = rule.translation && !introduced.has(key);
      introduced.add(key);
      if (!firstUse || value.toLowerCase().includes(key)) return value;
      return value.replace(new RegExp(escapeRegExp(rule.translation), "i"), (meaning) => `${meaning} (${rule.term})`);
    }, text));
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("material");
    const source = form.get("sourceLanguage");
    const target = form.get("targetLanguage");
    const materialId = String(form.get("materialId") || "");
    const pageNumber = Number(form.get("pageNumber"));
    const keywords = String(form.get("keywords") || "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (!(file instanceof File) || file.type !== "application/pdf") {
      return Response.json({ error: "Please upload a PDF file." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "PDF size must be 20 MB or less." }, { status: 400 });
    }
    if (!getLanguageCode(source) || !getLanguageCode(target) || source === target) {
      return Response.json({ error: "Choose two different supported languages." }, { status: 400 });
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 500) {
      return Response.json({ error: "Choose a valid PDF page." }, { status: 400 });
    }

    const layout = await analyzePdf(file, pageNumber);
    const page = layout.pages[0];
    const blocks = pageBlocks(layout, page);
    if (!blocks.length) return Response.json({ error: "No readable text was found outside images on this page." }, { status: 422 });

    const automaticTerms = await detectImportantTerms(blocks, target);
    const pageText = blocks.map((block) => block.content).join("\n").toLowerCase();
    const keepEnglish = [...new Set([...keywords, ...automaticTerms.keepEnglish])]
      .filter((term) => pageText.includes(term.toLowerCase()));
    const kept = new Set(keepEnglish.map((term) => term.toLowerCase()));
    const rules = [
      ...keepEnglish.map((term) => ({ term, translation: "" })),
      ...automaticTerms.bilingual.filter(({ term }) => !kept.has(term.toLowerCase())).map(({ term }) => ({ term, translation: "" }))
    ].sort((a, b) => b.term.length - a.term.length);
    const drafts = await translateLines(blocks, source, target, []);
    const azureTranslation = await translateWithAzure(blocks, target, rules, drafts);
    const translated = azureTranslation || await translateLines(blocks, source, target, rules);
    const translatedPage = {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      keywords: rules.map(({ term }) => term),
      blocks: blocks.map((block, index) => ({ ...block, text: translated[index], insideFigure: undefined }))
    };
    if (materialId) await saveTranslation({
      materialId,
      fileName: file.name,
      targetLanguage: target,
      pageNumber,
      page: translatedPage
    });
    return Response.json({ page: translatedPage });
  } catch (error) {
    console.error("Translation failed", error);
    return Response.json({ error: error.message || "Translation failed." }, { status: 500 });
  }
}
