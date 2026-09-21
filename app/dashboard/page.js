"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { languages } from "../../lib/languages";
import { sarvamVoicesV3 } from "../../lib/sarvam-voices";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

const menu = [
  "Dashboard",
  "Upload Material",
  "My Materials",
  "Recent Translations",
  "Saved Glossary",
  "AI Ask",
  "Audio Lessons",
  "Profile / Settings"
];

const audioVoices = sarvamVoicesV3;
const formatBytes = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
const groupTranslations = (translations) => Object.values(translations.reduce((groups, translation) => {
  const group = groups[translation.language] || { language: translation.language, pages: [] };
  group.pages.push(translation);
  group.pages.sort((a, b) => a.page - b.page);
  groups[translation.language] = group;
  return groups;
}, {}));
const groupAudioLessons = (audioLessons) => Object.values(audioLessons.reduce((groups, audio) => {
  const key = [audio.sourceType, audio.language, audio.speaker, audio.model, audio.pace].join("|");
  const group = groups[key] || { key, sourceType: audio.sourceType, language: audio.language, speaker: audio.speaker, model: audio.model, pace: audio.pace, pages: [] };
  group.pages.push(audio);
  group.pages.sort((a, b) => a.page - b.page);
  groups[key] = group;
  return groups;
}, {}));

function AudioLessonCard({ material, lesson, onShare }) {
  const [index, setIndex] = useState(0);
  const audio = lesson.pages[index];
  const downloadUrl = `/api/audio?${new URLSearchParams({ materialId: material.id, name: material.name, sourceType: lesson.sourceType, language: lesson.language, model: lesson.model, speaker: lesson.speaker, pace: String(lesson.pace) })}`;
  return <article className="output-item audio-item">
    <div><span>AUDIO · {lesson.language.toUpperCase()} · {lesson.sourceType.toUpperCase()}</span><strong>{material.name}</strong><small>{lesson.speaker.charAt(0).toUpperCase() + lesson.speaker.slice(1)} · {lesson.model.replace("-", ":")} · {lesson.pace}x · {lesson.pages.length} {lesson.pages.length === 1 ? "page" : "pages"}</small></div>
    <div className="audio-player"><audio key={audio.url} controls preload="metadata" src={audio.url}>Your browser does not support audio playback.</audio><div className="audio-page-controls"><button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>←</button><span>Page {audio.page || index + 1} of {lesson.pages.at(-1)?.page || lesson.pages.length}</span><button type="button" onClick={() => setIndex((value) => Math.min(lesson.pages.length - 1, value + 1))} disabled={index === lesson.pages.length - 1}>→</button></div></div>
    <div className="output-actions"><a href={downloadUrl} download>Download Audio</a><button type="button" onClick={() => onShare(audio.name, audio.url)}>Share</button></div>
  </article>;
}

const descriptions = {
  Dashboard: "Everything you need for learning, translation, and audio in one place.",
  "Upload Material": "Add a document or lesson to begin.",
  "My Materials": "View and organize your learning materials.",
  "Recent Translations": "Continue working with your latest translations.",
  "Saved Glossary": "Review the words and phrases you saved.",
  "AI Ask": "Talk naturally with your learning material in any language.",
  "Audio Lessons": "Listen to lessons in your preferred language.",
  "Profile / Settings": "Manage your profile and learning preferences."
};

function drawTranslatedPage(canvas, page, viewport) {
  const context = canvas.getContext("2d");
  const scaleX = viewport.width / page.width;
  const scaleY = viewport.height / page.height;

  for (const block of page.blocks) {
    const points = typeof block.polygon[0] === "number"
      ? block.polygon.reduce((result, value, index) => {
          if (index % 2 === 0) result.push([value, block.polygon[index + 1]]);
          return result;
        }, [])
      : block.polygon.map((point) => [point.x, point.y]);
    const xs = points.map(([x]) => x * scaleX);
    const ys = points.map(([, y]) => y * scaleY);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    const heading = block.role === "title" || block.role === "sectionHeading";
    const lineHeight = height / block.lineCount;
    const fontSize = Math.max(7, lineHeight * (heading ? 0.82 : 0.72));
    context.font = `${heading ? 700 : 400} ${fontSize}px "Nirmala UI", "Noto Sans", sans-serif`;
    const words = block.text.trim().split(/\s+/);
    const targetWidth = words.reduce((sum, word) => sum + context.measureText(`${word} `).width, 0) / block.lineCount;
    const rows = [];
    let row = "";
    let rowWidth = 0;
    words.forEach((word, index) => {
      const wordWidth = context.measureText(`${word} `).width;
      const wordsLeft = words.length - index;
      const rowsLeft = block.lineCount - rows.length;
      if (row && rows.length < block.lineCount - 1 && rowWidth + wordWidth > targetWidth && wordsLeft >= rowsLeft) {
        rows.push(row);
        row = word;
        rowWidth = wordWidth;
      } else {
        row += `${row ? " " : ""}${word}`;
        rowWidth += wordWidth;
      }
    });
    if (row) rows.push(row);

    context.fillStyle = "#fff";
    context.fillRect(x - 4, y - 3, width + 8, height + 6);
    context.fillStyle = "#111827";
    context.textBaseline = "top";
    const startY = y + Math.max(0, (height - rows.length * lineHeight) / 2);
    rows.forEach((row, index) => context.fillText(row, x, startY + index * lineHeight, width));
  }
}

export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Dashboard");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [materialFile, setMaterialFile] = useState(null);
  const [materialId, setMaterialId] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [busyItem, setBusyItem] = useState("");
  const [audioSourceKey, setAudioSourceKey] = useState("");
  const [audioSpeaker, setAudioSpeaker] = useState("shubh");
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [aiMaterialId, setAiMaterialId] = useState("");
  const [aiMessages, setAiMessages] = useState([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiStatus, setAiStatus] = useState("Connecting...");
  const [aiListening, setAiListening] = useState(false);
  const [aiAudioUrl, setAiAudioUrl] = useState("");
  const [aiSpeaker, setAiSpeaker] = useState("shubh");
  const [aiPace, setAiPace] = useState(1);
  const [aiPdfDoc, setAiPdfDoc] = useState(null);
  const [aiPageNumber, setAiPageNumber] = useState(1);
  const [aiZoom, setAiZoom] = useState(.9);
  const [aiRendering, setAiRendering] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [originalZoom, setOriginalZoom] = useState(1.25);
  const [translatedZoom, setTranslatedZoom] = useState(1.25);
  const [translatedPages, setTranslatedPages] = useState({});
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const translationSettingsRef = useRef(null);
  const documentKeywordsRef = useRef(new Set());
  const originalCanvasRef = useRef(null);
  const translatedCanvasRef = useRef(null);
  const originalStageRef = useRef(null);
  const translatedStageRef = useRef(null);
  const pendingPageRef = useRef(1);
  const aiSocketRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const aiCanvasRef = useRef(null);
  const aiStageRef = useRef(null);
  const audioSources = materials.flatMap((material) => {
    const groups = groupTranslations(material.translations);
    if (!groups.length) return [];
    const originalPages = [...groups].sort((a, b) => b.pages.length - a.pages.length)[0];
    return [
      { key: `${material.id}|original|${originalPages.language}`, material, type: "original", language: "english", lookupLanguage: originalPages.language, pages: originalPages.pages, label: `${material.name} — Original (English)` },
      ...groups.map((group) => ({ key: `${material.id}|translated|${group.language}`, material, type: "translated", language: group.language, lookupLanguage: group.language, pages: group.pages, label: `${material.name} — Translated (${group.language.charAt(0).toUpperCase() + group.language.slice(1)})` }))
    ];
  });
  const audioSource = audioSources.find((source) => source.key === audioSourceKey);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl]);

  useEffect(() => () => aiAudioUrl && URL.revokeObjectURL(aiAudioUrl), [aiAudioUrl]);

  useEffect(() => {
    if (active !== "AI Ask") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ai-ask-ws`);
    aiSocketRef.current = socket;
    socket.onopen = () => setAiStatus("Ready to listen");
    socket.onclose = () => setAiStatus("Connection closed");
    socket.onerror = () => setAiStatus("Could not connect");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "listening") setAiStatus("Listening...");
      if (message.type === "status") setAiStatus(message.message);
      if (message.type === "transcript") setAiMessages((items) => [...items, { role: "user", content: message.text }]);
      if (message.type === "answer_start") { setAiStatus("Answering..."); setAiMessages((items) => [...items, { role: "assistant", content: "" }]); }
      if (message.type === "delta") setAiMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: item.content + message.text } : item));
      if (message.type === "audio") {
        const bytes = Uint8Array.from(atob(message.audio), (character) => character.charCodeAt(0));
        setAiAudioUrl(URL.createObjectURL(new Blob([bytes], { type: message.mimeType })));
      }
      if (message.type === "done") setAiStatus("Reply ready");
      if (message.type === "error") setAiStatus(message.message);
    };
    return () => { socket.close(); aiSocketRef.current = null; };
  }, [active]);

  useEffect(() => {
    if (active !== "AI Ask" || !aiMaterialId) { setAiPdfDoc(null); return; }
    const material = materials.find((item) => item.id === aiMaterialId);
    if (!material) return;
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(material.originalUrl);
    setAiStatus("Opening PDF...");
    loadingTask.promise.then((document) => {
      if (!cancelled) { setAiPdfDoc(document); setAiPageNumber(1); setAiZoom(.9); setAiStatus("Ready to listen"); }
    }).catch(() => !cancelled && setAiStatus("Could not open this PDF."));
    return () => { cancelled = true; loadingTask.destroy(); };
  }, [active, aiMaterialId, materials]);

  useEffect(() => {
    if (!aiPdfDoc || !aiCanvasRef.current || !aiStageRef.current) return;
    let cancelled = false;
    setAiRendering(true);
    aiPdfDoc.getPage(aiPageNumber).then(async (page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const stage = aiStageRef.current;
      const scale = Math.min((stage.clientWidth - 32) / base.width, (stage.clientHeight - 32) / base.height) * aiZoom;
      const viewport = page.getViewport({ scale: Math.max(scale, .1) * (window.devicePixelRatio || 1) });
      const canvas = aiCanvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (!cancelled) setAiRendering(false);
    });
    return () => { cancelled = true; };
  }, [aiPdfDoc, aiPageNumber, aiZoom]);

  useEffect(() => {
    if (!fileUrl) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(fileUrl);
    loadingTask.promise.then((document) => {
      if (!cancelled) {
        setPdfDoc(document);
        setPageNumber(pendingPageRef.current);
      }
    });
    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!pdfDoc || !originalCanvasRef.current || !originalStageRef.current) return;
    let cancelled = false;
    setRendering(true);
    pdfDoc.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const renderCanvas = async (canvas, stage, translatedPage, zoom) => {
        if (!canvas || !stage) return;
        const scale = Math.min((stage.clientWidth - 24) / baseViewport.width, (stage.clientHeight - 24) / baseViewport.height) * zoom;
        const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });
        const renderViewport = page.getViewport({ scale: Math.max(scale, 0.1) * (window.devicePixelRatio || 1) });
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: renderViewport }).promise;
        if (translatedPage) drawTranslatedPage(canvas, translatedPage, renderViewport);
      };
      await Promise.all([
        renderCanvas(originalCanvasRef.current, originalStageRef.current, null, originalZoom),
        showTranslated && renderCanvas(translatedCanvasRef.current, translatedStageRef.current, translatedPages[pageNumber], translatedZoom)
      ]);
      if (!cancelled) setRendering(false);
    });
    return () => { cancelled = true; };
  }, [pdfDoc, pageNumber, showTranslated, translatedPages, originalZoom, translatedZoom]);

  const selectFile = async (file) => {
    if (!file) return;
    setMaterialFile(file);
    pendingPageRef.current = 1;
    setOriginalZoom(1.25);
    setTranslatedZoom(1.25);
    setMaterialId("");
    setFileName(file.name);
    setFileUrl(file.type === "application/pdf" ? URL.createObjectURL(file) : "");
    setTranslatedPages({});
    setShowTranslated(false);
    setTranslationError("");
    translationSettingsRef.current = null;
    documentKeywordsRef.current.clear();
    setSavingMaterial(true);
    try {
      const form = new FormData();
      form.set("material", file);
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save material.");
      setMaterialId(result.material.id);
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setSavingMaterial(false);
    }
  };

  const translatePage = async (requestedPage, settings) => {
    setTranslating(true);
    setTranslationError("");
    try {
      const form = new FormData();
      form.set("material", materialFile);
      form.set("pageNumber", String(requestedPage));
      form.set("sourceLanguage", settings.sourceLanguage);
      form.set("targetLanguage", settings.targetLanguage);
      form.set("materialId", materialId);
      form.set("keywords", [settings.keywords, ...documentKeywordsRef.current].filter(Boolean).join(","));
      const response = await fetch("/api/translate", { method: "POST", body: form });
      const body = await response.text();
      let result;
      try { result = JSON.parse(body); }
      catch { throw new Error(`Translation server returned ${response.status}. Please restart the app server.`); }
      if (!response.ok) throw new Error(result.error || "Translation failed.");
      result.page.keywords.forEach((keyword) => documentKeywordsRef.current.add(keyword));
      setTranslatedPages((pages) => ({ ...pages, [requestedPage]: result.page }));
      return true;
    } catch (error) {
      setTranslationError(error.message);
      return false;
    } finally {
      setTranslating(false);
    }
  };

  const translateMaterial = async (event) => {
    event.preventDefault();
    if (!materialFile) return;
    const form = new FormData(event.currentTarget);
    const settings = {
      sourceLanguage: form.get("sourceLanguage"),
      targetLanguage: form.get("targetLanguage"),
      keywords: form.get("keywords") || ""
    };
    if (translationSettingsRef.current && JSON.stringify(translationSettingsRef.current) !== JSON.stringify(settings)) {
      setTranslatedPages({});
      documentKeywordsRef.current.clear();
    }
    translationSettingsRef.current = settings;
    if (await translatePage(pageNumber, settings)) setShowTranslated(true);
  };

  useEffect(() => setTranslationError(""), [pageNumber]);

  useEffect(() => {
    if (!["My Materials", "Recent Translations", "Audio Lessons", "AI Ask"].includes(active)) return;
    let cancelled = false;
    setMaterialsLoading(true);
    fetch("/api/materials")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load materials.");
        if (!cancelled) setMaterials(result.materials);
      })
      .catch((error) => !cancelled && setTranslationError(error.message))
      .finally(() => !cancelled && setMaterialsLoading(false));
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (active !== "Profile / Settings") return;
    setProfileStatus("");
    fetch("/api/auth").then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load profile.");
      setProfile(result.user);
    }).catch((error) => { setProfile(null); setProfileStatus(error.message); });
  }, [active]);

  useEffect(() => {
    if (active === "AI Ask" && materials.length && !materials.some((material) => material.id === aiMaterialId)) setAiMaterialId(materials[0].id);
  }, [active, materials, aiMaterialId]);

  useEffect(() => {
    if (active !== "Audio Lessons") return;
    if (audioSources.length && !audioSource) setAudioSourceKey(audioSources[0].key);
  }, [active, audioSources, audioSource]);

  useEffect(() => {
    if (showTranslated && translationSettingsRef.current && !translatedPages[pageNumber] && !translating && !translationError) {
      translatePage(pageNumber, translationSettingsRef.current);
    }
  }, [pageNumber, showTranslated, translatedPages, translating, translationError]);

  const selectItem = (item) => {
    setActive(item);
    setOpen(false);
    setSelectedMaterialId("");
    setTranslationError("");
    if (item !== "Upload Material") {
      setFileName("");
      setFileUrl("");
      setMaterialFile(null);
      setMaterialId("");
      setPdfDoc(null);
      setPageNumber(1);
      setTranslatedPages({});
      setShowTranslated(false);
      translationSettingsRef.current = null;
      documentKeywordsRef.current.clear();
    }
  };

  const openSavedCategory = (item, id) => {
    selectItem(item);
    setSelectedMaterialId(id);
  };

  const openSavedTranslation = async (material, translationGroup) => {
    setMaterialsLoading(true);
    setTranslationError("");
    try {
      const [originalResponse, ...translationResponses] = await Promise.all([
        fetch(material.originalUrl),
        ...translationGroup.pages.map((translation) => fetch(translation.url))
      ]);
      if (!originalResponse.ok || translationResponses.some((response) => !response.ok)) throw new Error("Could not open the saved translation.");
      const [blob, translatedPageList] = await Promise.all([
        originalResponse.blob(),
        Promise.all(translationResponses.map((response) => response.json()))
      ]);
      const file = new File([blob], material.name, { type: blob.type || "application/pdf" });
      const firstPage = translationGroup.pages[0].page;
      const targetLanguage = translationGroup.language.charAt(0).toUpperCase() + translationGroup.language.slice(1);
      pendingPageRef.current = firstPage;
      setOriginalZoom(1.25);
      setTranslatedZoom(1.25);
      setMaterialFile(file);
      setMaterialId(material.id);
      setFileName(material.name);
      setFileUrl(URL.createObjectURL(file));
      setTranslatedPages(Object.fromEntries(translatedPageList.map((page) => [page.pageNumber, page])));
      setPageNumber(firstPage);
      setShowTranslated(true);
      translationSettingsRef.current = { sourceLanguage: "English", targetLanguage, keywords: "" };
      documentKeywordsRef.current = new Set(translatedPageList.flatMap((page) => page.keywords || []));
      setActive("Upload Material");
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const renameSavedMaterial = async (material) => {
    const name = window.prompt("Rename material", material.name)?.trim();
    if (!name || name === material.name) return;
    setBusyItem(material.id);
    try {
      const response = await fetch("/api/materials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: material.id, name })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not rename material.");
      setMaterials((items) => items.map((item) => item.id === material.id ? { ...item, name } : item));
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setBusyItem("");
    }
  };

  const deleteSavedMaterial = async (material) => {
    if (!window.confirm(`Delete ${material.name} and all its translations and audio lessons?`)) return;
    setBusyItem(material.id);
    try {
      const response = await fetch(`/api/materials?id=${encodeURIComponent(material.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete material.");
      setMaterials((items) => items.filter((item) => item.id !== material.id));
      if (selectedMaterialId === material.id) setSelectedMaterialId("");
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setBusyItem("");
    }
  };

  const shareSavedFile = async (name, url) => {
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert("Secure link copied. It expires in 15 minutes.");
      }
    } catch (error) {
      if (error.name !== "AbortError") setTranslationError("Could not share this file.");
    }
  };

  const exportTranslation = async (material, translationGroup, format) => {
    const key = `${material.id}-${translationGroup.language}-${format}`;
    setBusyItem(key);
    setTranslationError("");
    try {
      const records = translationGroup.pages;
      const pages = await Promise.all(records.map(async (translation) => {
        const response = await fetch(translation.url);
        if (!response.ok) throw new Error("Could not load a saved translated page.");
        return response.json();
      }));
      const baseName = material.name.replace(/\.[^.]+$/, "");
      if (format === "word") {
        const body = pages.map((page) => `<section>${page.blocks.map((block) => `<p>${escapeHtml(block.text)}</p>`).join("")}</section>`).join("<hr>");
        downloadBlob(new Blob([`<html><head><meta charset="utf-8"></head><body>${body}</body></html>`], { type: "application/msword" }), `${baseName}-${translationGroup.language}.doc`);
        return;
      }
      const originalResponse = await fetch(material.originalUrl);
      if (!originalResponse.ok) throw new Error("Could not load the original PDF.");
      const sourcePdf = await pdfjsLib.getDocument({ data: await originalResponse.arrayBuffer() }).promise;
      const { jsPDF } = await import("jspdf");
      let output;
      for (let index = 0; index < records.length; index += 1) {
        const sourcePage = await sourcePdf.getPage(records[index].page);
        const viewport = sourcePage.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await sourcePage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        drawTranslatedPage(canvas, pages[index], viewport);
        const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
        if (!output) output = new jsPDF({ unit: "px", format: [canvas.width, canvas.height], orientation, hotfixes: ["px_scaling"] });
        else output.addPage([canvas.width, canvas.height], orientation);
        output.addImage(canvas.toDataURL("image/jpeg", .94), "JPEG", 0, 0, canvas.width, canvas.height);
      }
      output.save(`${baseName}-${translationGroup.language}.pdf`);
    } catch (error) {
      setTranslationError(error.message || "Export failed.");
    } finally {
      setBusyItem("");
    }
  };

  const generateAudioLesson = async (event) => {
    event.preventDefault();
    if (!audioSource) return;
    const form = new FormData(event.currentTarget);
    setAudioGenerating(true);
    setTranslationError("");
    try {
      const response = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: audioSource.material.id,
          materialName: audioSource.material.name,
          sourceType: audioSource.type,
          lookupLanguage: audioSource.lookupLanguage,
          language: audioSource.language,
          startPage: Number(form.get("startPage")),
          endPage: Number(form.get("endPage")),
          model: "bulbul:v3",
          speaker: audioSpeaker,
          pace: Number(form.get("pace"))
        })
      });
      const body = await response.text();
      let result;
      try { result = JSON.parse(body); } catch { throw new Error(`Audio server returned ${response.status}. Please restart the app server.`); }
      if (!response.ok) throw new Error(result.error || "Could not generate audio.");
      const refreshed = await fetch("/api/materials").then((value) => value.json());
      setMaterials(refreshed.materials || []);
    } catch (error) {
      setTranslationError(error.message);
    } finally {
      setAudioGenerating(false);
    }
  };

  const askAstra = (event) => {
    event.preventDefault();
    const question = aiQuestion.trim();
    if (!question || !aiMaterialId || aiSocketRef.current?.readyState !== WebSocket.OPEN) return;
    aiSocketRef.current.send(JSON.stringify({ type: "ask", question, materialId: aiMaterialId, pageNumber: aiPageNumber, speaker: aiSpeaker, pace: aiPace, history: aiMessages.slice(-8) }));
    setAiQuestion("");
    setAiStatus("Thinking...");
  };

  const toggleListening = async () => {
    if (aiListening) {
      recorderRef.current?.stop();
      setAiListening(false);
      setAiStatus("Processing speech...");
      return;
    }
    try {
      if (!aiMaterialId || aiSocketRef.current?.readyState !== WebSocket.OPEN) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      aiSocketRef.current.send(JSON.stringify({ type: "start", materialId: aiMaterialId, pageNumber: aiPageNumber, speaker: aiSpeaker, pace: aiPace, history: aiMessages.slice(-8), mimeType }));
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data.arrayBuffer().then((data) => aiSocketRef.current?.send(data)));
      };
      recorder.onstop = async () => {
        await Promise.all(audioChunksRef.current);
        aiSocketRef.current?.send(JSON.stringify({ type: "stop" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(250);
      setAiListening(true);
      setAiStatus("Listening...");
    } catch (error) {
      setAiStatus(error.message || "Microphone access failed.");
    }
  };

  const updateProfile = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileBusy(true);
    setProfileStatus("");
    try {
      const response = await fetch("/api/auth", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), role: form.get("role"), preferredLanguage: form.get("preferredLanguage"), gradeSubject: form.get("gradeSubject"), notifications: form.get("notifications") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save settings.");
      setProfile(result.user);
      setProfileStatus("Settings saved.");
    } catch (error) { setProfileStatus(error.message); }
    finally { setProfileBusy(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) return setProfileStatus("New passwords do not match.");
    setProfileBusy(true);
    setProfileStatus("");
    try {
      const response = await fetch("/api/auth", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not change password.");
      event.currentTarget.reset();
      setProfileStatus("Password changed.");
    } catch (error) { setProfileStatus(error.message); }
    finally { setProfileBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/";
  };

  const visibleMaterials = materials.filter((material) => {
    const matchesSearch = material.name.toLowerCase().includes(librarySearch.trim().toLowerCase());
    const matchesSelection = !selectedMaterialId || material.id === selectedMaterialId;
    const matchesFilter = libraryFilter === "all"
      || (libraryFilter === "translated" && material.translations.length)
      || (libraryFilter === "audio" && material.audioLessons.length);
    return matchesSearch && matchesSelection && matchesFilter;
  });
  const audioPages = audioSource?.pages || [];
  const firstAudioPage = audioPages[0]?.page || 1;
  const lastAudioPage = audioPages.at(-1)?.page || 1;
  const aiBusy = !["Ready to listen", "Listening...", "Reply ready"].includes(aiStatus);
  const aiWaveActive = aiListening || ["Answering...", "Creating voice reply...", "Speaking..."].includes(aiStatus);

  const libraryTabs = <nav className="library-tabs" aria-label="Material categories">
    <button type="button" className={active === "My Materials" ? "active" : ""} onClick={() => { setActive("My Materials"); setSelectedMaterialId(""); }}>Saved Documents</button>
    <button type="button" className={active === "Recent Translations" ? "active" : ""} onClick={() => { setActive("Recent Translations"); setSelectedMaterialId(""); }}>Translated Documents</button>
    <button type="button" className={active === "Audio Lessons" ? "active" : ""} onClick={() => { setActive("Audio Lessons"); setSelectedMaterialId(""); }}>Audio Lessons</button>
  </nav>;

  const libraryTools = <div className="library-tools">
    <label><span className="sr-only">Search materials</span><input type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search materials…" /></label>
    <select aria-label="Filter materials" value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)}><option value="all">All materials</option><option value="translated">Has translations</option><option value="audio">Has audio</option></select>
  </div>;

  return (
    <main className={`dashboard-page ${active === "AI Ask" ? "ai-ask-page" : ""}`}>
      <button className={`menu-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="dashboard-menu" aria-label={open ? "Close menu" : "Open menu"}>
        <span /><span /><span />
      </button>

      <button className={`drawer-backdrop ${open ? "visible" : ""}`} onClick={() => setOpen(false)} aria-label="Close menu" tabIndex={open ? 0 : -1} />
      <aside className={`side-drawer ${open ? "open" : ""}`} id="dashboard-menu" aria-hidden={!open}>
        <div className="drawer-brand"><strong>Astra</strong></div>
        <nav aria-label="Dashboard navigation">
          {menu.map((item) => (
            <button key={item} className={active === item ? "active" : ""} onClick={() => selectItem(item)} tabIndex={open ? 0 : -1}>
              {item}
            </button>
          ))}
        </nav>
        <a className="back-home" href="/">← Back to welcome</a>
      </aside>

      <section className={`dashboard-content ${active === "Upload Material" ? "upload-view" : ""} ${active === "AI Ask" ? "ai-mode" : ""} ${fileUrl ? "pdf-mode" : ""}`} id="main-content">
        {!fileUrl && active !== "AI Ask" && <>
          <p className="dashboard-kicker">YOUR LEARNING SPACE</p>
          <h1>{active}</h1>
          <p className="dashboard-intro">{descriptions[active]}</p>
        </>}

        {active === "Dashboard" ? (
          <div className="dashboard-grid">
            <button className="action-card" onClick={() => setActive("Upload Material")}><span>01</span><strong>Upload Material</strong><small>Start with a document, image, or lesson.</small><i>→</i></button>
            <button className="action-card" onClick={() => setActive("Recent Translations")}><span>02</span><strong>Translate Content</strong><small>Make learning material easier to understand.</small><i>→</i></button>
            <button className="action-card" onClick={() => setActive("Audio Lessons")}><span>03</span><strong>Audio Lessons</strong><small>Listen and learn in your language.</small><i>→</i></button>
          </div>
        ) : active === "My Materials" ? (
          <div className="materials-library">
            {libraryTabs}{libraryTools}
            {materialsLoading ? <p className="library-status">Loading your materials…</p> : visibleMaterials.length ? (
              <div className="materials-grid">
                {visibleMaterials.map((material) => <article className="material-item" key={material.id}>
                  <div className="material-file-icon" aria-hidden="true">{material.name.split(".").pop().slice(0, 4).toUpperCase()}</div>
                  <div className="material-details">
                    <strong>{material.name}</strong>
                    <small>{formatBytes(material.size)} · {new Date(material.uploadedAt).toLocaleDateString()}</small>
                    <div className="material-badges"><span>Original</span><button type="button" disabled={!material.translations.length} onClick={() => openSavedCategory("Recent Translations", material.id)}>{material.translations.length} translated</button><button type="button" disabled={!material.audioLessons.length} onClick={() => openSavedCategory("Audio Lessons", material.id)}>{material.audioLessons.length} audio</button></div>
                  </div>
                  <div className="material-actions"><a href={material.originalUrl} target="_blank" rel="noreferrer">Open</a><button type="button" onClick={() => renameSavedMaterial(material)} disabled={busyItem === material.id}>Rename</button><button type="button" onClick={() => shareSavedFile(material.name, material.originalUrl)}>Share</button><button className="delete" type="button" onClick={() => deleteSavedMaterial(material)} disabled={busyItem === material.id}>Delete</button></div>
                </article>)}
              </div>
            ) : <div className="empty-library"><strong>No matching documents</strong><p>Upload a file or change your search and filter.</p></div>}
            {translationError && <p className="translation-message error" role="alert">{translationError}</p>}
          </div>
        ) : active === "Recent Translations" ? (
          <div className="materials-library">
            {libraryTabs}{libraryTools}
            {selectedMaterialId && <button className="library-back" type="button" onClick={() => setSelectedMaterialId("")}>← All translations</button>}
            {materialsLoading ? <p className="library-status">Loading translations…</p> : visibleMaterials.some((material) => material.translations.length) ? (
              <div className="output-list">{visibleMaterials.flatMap((material) => groupTranslations(material.translations).map((group) => <article className="output-item" key={`${material.id}-${group.language}`}>
                <div><span>TRANSLATED · {group.language.toUpperCase()}</span><strong>{material.name}</strong><small>{group.pages.length} {group.pages.length === 1 ? "page" : "pages"}</small></div>
                <div className="output-actions"><button className="primary" type="button" onClick={() => openSavedTranslation(material, group)}>Reuse Translation</button><button type="button" onClick={() => exportTranslation(material, group, "pdf")} disabled={busyItem === `${material.id}-${group.language}-pdf`}>Export as PDF</button><button type="button" onClick={() => exportTranslation(material, group, "word")} disabled={busyItem === `${material.id}-${group.language}-word`}>Export as Word</button><button type="button" onClick={() => shareSavedFile(`${material.name} translation`, group.pages[0].url)}>Share</button></div>
              </article>))}</div>
            ) : <div className="empty-library"><strong>No translations yet</strong><p>Translate a material and it will appear here.</p></div>}
            {translationError && <p className="translation-message error" role="alert">{translationError}</p>}
          </div>
        ) : active === "AI Ask" ? (
          <div className="ai-ask-workspace">
            <section className="ai-pdf-panel">
              <div className="ai-pdf-toolbar">
                <label>Learning material<select value={aiMaterialId} onChange={(event) => { setAiMaterialId(event.target.value); setAiMessages([]); setAiAudioUrl(""); }} disabled={!materials.length}>{materials.map((material) => <option key={material.id} value={material.id}>{material.name} · Original PDF</option>)}</select></label>
                <div className="ai-pdf-tools"><small>Only the open page is shared with Astra</small><div className="pane-zoom" aria-label="AI Ask PDF zoom"><button type="button" onClick={() => setAiZoom((value) => Math.max(.5, +(value - .1).toFixed(2)))} disabled={aiZoom <= .5} aria-label="Zoom out PDF">−</button><button className="zoom-level" type="button" onClick={() => setAiZoom(.9)} aria-label="Reset PDF zoom">{Math.round(aiZoom * 100)}%</button><button type="button" onClick={() => setAiZoom((value) => Math.min(2.5, +(value + .1).toFixed(2)))} disabled={aiZoom >= 2.5} aria-label="Zoom in PDF">+</button></div></div>
              </div>
              <div className="ai-pdf-stage" ref={aiStageRef}>{aiPdfDoc && <canvas ref={aiCanvasRef} aria-label={`PDF page ${aiPageNumber} of ${aiPdfDoc.numPages}`} />}{(!aiPdfDoc || aiRendering) && <span>{aiRendering ? "Rendering page..." : "Opening PDF..."}</span>}</div>
              <div className="ai-pdf-controls"><button type="button" onClick={() => { setAiPageNumber((page) => Math.max(1, page - 1)); setAiMessages([]); setAiAudioUrl(""); }} disabled={!aiPdfDoc || aiPageNumber === 1}>← Previous</button><span>Page {aiPageNumber} of {aiPdfDoc?.numPages || "—"}</span><button type="button" onClick={() => { setAiPageNumber((page) => Math.min(aiPdfDoc?.numPages || page, page + 1)); setAiMessages([]); setAiAudioUrl(""); }} disabled={!aiPdfDoc || aiPageNumber === aiPdfDoc.numPages}>Next →</button></div>
            </section>
            <aside className="ai-voice-panel">
              <div className="ai-live-status"><i className={aiWaveActive ? "active" : ""} /><span>{aiStatus}</span></div>
              <div className={`ai-wave ${aiWaveActive ? "active" : ""}`} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--wave": index, height: `${12 + (index * 7) % 30}px` }} />)}</div>
              <div className="ai-voice-options"><label>Voice<select value={aiSpeaker} onChange={(event) => setAiSpeaker(event.target.value)}>{audioVoices.map((voice) => <option key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</option>)}</select></label><label>Pace<select value={aiPace} onChange={(event) => setAiPace(Number(event.target.value))}><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></label></div>
              <button className={`ai-voice-button ${aiListening ? "active" : ""}`} type="button" onClick={toggleListening} disabled={(!aiListening && aiBusy) || !aiMaterialId} aria-label={aiListening ? "Stop listening" : "Start voice question"}><span>{aiListening ? "■" : "●"}</span>{aiListening ? "Stop listening" : "Talk to Astra"}</button>
              <div className="ai-conversation" aria-live="polite">
                {!aiMessages.length && <div className="ai-empty"><strong>Ask about page {aiPageNumber}</strong><p>Speak in any language. Technical and exam terms remain in English.</p></div>}
                {aiMessages.map((message, index) => <article key={index} className={`ai-message ${message.role}`}><span>{message.role === "user" ? "You" : "Astra"}</span><p>{message.content || "Thinking..."}</p></article>)}
              </div>
              {aiAudioUrl && <audio className="ai-reply-audio" key={aiAudioUrl} controls autoPlay src={aiAudioUrl} onPlay={() => setAiStatus("Speaking...")} onEnded={() => setAiStatus("Ready to listen")}>Your browser does not support audio playback.</audio>}
              <form className="ai-composer" onSubmit={askAstra}>
                <input value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder={`Ask about page ${aiPageNumber}...`} aria-label="Question for Astra" disabled={aiBusy || !aiMaterialId} />
                <button className="ai-send" type="submit" disabled={aiBusy || !aiQuestion.trim() || !aiMaterialId}>Send →</button>
              </form>
            </aside>
          </div>
        ) : active === "Audio Lessons" ? (
          <div className="materials-library">
            {libraryTabs}
            <form className="audio-generator" onSubmit={generateAudioLesson}>
              <div className="audio-generator-heading"><span>AI AUDIO STUDIO</span><strong>Create an audio lesson</strong><small>Generate clear, page-by-page narration from a saved translation.</small></div>
              <div className="audio-generator-fields">
                <label className="audio-material-field">Content<select value={audioSourceKey} onChange={(event) => setAudioSourceKey(event.target.value)} disabled={!audioSources.length}>{audioSources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label>
                <label>Voice<select value={audioSpeaker} onChange={(event) => setAudioSpeaker(event.target.value)}>{audioVoices.map((voice) => <option key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</option>)}</select></label>
                <label>From page<input key={`from-${audioSourceKey}`} name="startPage" type="number" min={firstAudioPage} max={lastAudioPage} defaultValue={firstAudioPage} /></label>
                <label>To page<input key={`to-${audioSourceKey}`} name="endPage" type="number" min={firstAudioPage} max={lastAudioPage} defaultValue={lastAudioPage} /></label>
                <label>Reading speed<select name="pace" defaultValue="1"><option value="0.75">0.75x Relaxed</option><option value="1">1x Natural</option><option value="1.25">1.25x Brisk</option><option value="1.5">1.5x Fast</option></select></label>
                <button type="submit" disabled={audioGenerating || !audioPages.length}><span>{audioGenerating ? "Generating audio..." : "Generate Audio Lesson"}</span><b aria-hidden="true">→</b></button>
              </div>
            </form>
            {libraryTools}
            {selectedMaterialId && <button className="library-back" type="button" onClick={() => setSelectedMaterialId("")}>← All audio lessons</button>}
            {materialsLoading ? <p className="library-status">Loading audio lessons…</p> : visibleMaterials.some((material) => material.audioLessons.length) ? (
              <div className="output-list">{visibleMaterials.flatMap((material) => groupAudioLessons(material.audioLessons).map((lesson) => <AudioLessonCard key={`${material.id}-${lesson.key}`} material={material} lesson={lesson} onShare={shareSavedFile} />))}</div>
            ) : <div className="empty-library"><strong>No audio lessons yet</strong><p>Generated audio will appear here automatically.</p></div>}
            {translationError && <p className="translation-message error" role="alert">{translationError}</p>}
          </div>
        ) : active === "Profile / Settings" ? (
          profile ? (
            <div className="profile-settings">
              <form className="settings-card profile-details" key={profile.updatedAt || profile.id} onSubmit={updateProfile}>
                <div className="settings-heading"><span>ACCOUNT</span><h2>Personal Information</h2><p>Update your learning profile and preferences.</p></div>
                <div className="settings-fields">
                  <label>Full Name<input name="name" type="text" defaultValue={profile.name} autoComplete="name" required /></label>
                  <label>Email / Phone<input type="text" value={profile.contact} readOnly aria-readonly="true" /></label>
                  <label>Role<select name="role" defaultValue={profile.role}><option value="teacher">Teacher</option><option value="student">Student</option><option value="admin">Admin</option></select></label>
                  <label>Grade / Subject<input name="gradeSubject" type="text" defaultValue={profile.gradeSubject} placeholder="e.g. Grade 10 · Science" /></label>
                </div>
                <div className="settings-divider" />
                <div className="settings-fields compact">
                  <label>Preferred Language<select name="preferredLanguage" defaultValue={profile.preferredLanguage}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label>
                  <label className="notification-toggle"><input name="notifications" type="checkbox" defaultChecked={profile.notifications} /><span><strong>Notification Settings</strong><small>Receive learning and material updates.</small></span></label>
                </div>
                <button className="settings-save" type="submit" disabled={profileBusy}>{profileBusy ? "Saving..." : "Save Changes"}</button>
              </form>

              <form className="settings-card password-card" onSubmit={changePassword}>
                <div className="settings-heading"><span>SECURITY</span><h2>Change Password</h2><p>Use at least 8 characters for your new password.</p></div>
                <div className="settings-fields">
                  <label>Current Password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
                  <label>New Password<input name="newPassword" type="password" autoComplete="new-password" minLength="8" required /></label>
                  <label>Confirm New Password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" required /></label>
                </div>
                <div className="settings-actions"><button className="settings-save" type="submit" disabled={profileBusy}>{profileBusy ? "Updating..." : "Update Password"}</button><button className="logout-button" type="button" onClick={logout}>Logout</button></div>
              </form>
              {profileStatus && <p className="profile-status" role="status">{profileStatus}</p>}
            </div>
          ) : (
            <div className="profile-guest"><span aria-hidden="true">A</span><h2>Sign in to manage your profile</h2><p>{profileStatus && profileStatus !== "Not signed in." ? profileStatus : "Your personal details and settings are available after you sign in."}</p><a href="/">Sign In or Create Account</a></div>
          )
        ) : active === "Upload Material" ? (
          <form className="upload-card" onSubmit={translateMaterial}>
            <div className={`upload-workspace ${fileUrl ? "has-preview" : ""} ${showTranslated ? "is-comparing" : ""}`}>
              {fileUrl && <aside className={`pdf-preview ${showTranslated ? "is-comparing" : ""}`}>
                <div className="pdf-compare-grid">
                  <section className="pdf-pane">
                    <div className="pdf-preview-header"><span>Original</span><small>{fileName}</small><div className="pane-zoom" aria-label="Original PDF zoom"><button type="button" onClick={() => setOriginalZoom((value) => Math.max(.5, +(value - .25).toFixed(2)))} disabled={originalZoom <= .5} aria-label="Zoom out original">−</button><button className="zoom-level" type="button" onClick={() => setOriginalZoom(1.25)} aria-label="Reset original zoom">{Math.round(originalZoom * 100)}%</button><button type="button" onClick={() => setOriginalZoom((value) => Math.min(2.5, +(value + .25).toFixed(2)))} disabled={originalZoom >= 2.5} aria-label="Zoom in original">+</button></div></div>
                    <div className="pdf-page-stage" ref={originalStageRef} tabIndex={0} aria-label="Scrollable original PDF page">{!pdfDoc ? <span className="pdf-loading">Preparing preview…</span> : <canvas ref={originalCanvasRef} aria-label={`Original page ${pageNumber} of ${pdfDoc.numPages}`} />}{rendering && <span className="pdf-loading">Rendering page…</span>}</div>
                  </section>
                  {showTranslated && <section className={`pdf-pane translated-pane ${!translatedPages[pageNumber] ? "is-loading" : ""}`}>
                    <div className="pdf-preview-header"><span>Translated</span><small>{translationSettingsRef.current?.targetLanguage}</small><div className="pane-zoom" aria-label="Translated PDF zoom"><button type="button" onClick={() => setTranslatedZoom((value) => Math.max(.5, +(value - .25).toFixed(2)))} disabled={translatedZoom <= .5} aria-label="Zoom out translation">−</button><button className="zoom-level" type="button" onClick={() => setTranslatedZoom(1.25)} aria-label="Reset translation zoom">{Math.round(translatedZoom * 100)}%</button><button type="button" onClick={() => setTranslatedZoom((value) => Math.min(2.5, +(value + .25).toFixed(2)))} disabled={translatedZoom >= 2.5} aria-label="Zoom in translation">+</button></div></div>
                    <div className="pdf-page-stage" ref={translatedStageRef} tabIndex={0} aria-label="Scrollable translated PDF page">{pdfDoc ? <canvas ref={translatedCanvasRef} aria-label={`Translated page ${pageNumber} of ${pdfDoc.numPages}`} /> : <span className="pdf-loading">Preparing preview…</span>}{pdfDoc && (translating || !translatedPages[pageNumber]) && <span className="pdf-loading">Translating page…</span>}</div>
                  </section>}
                </div>
                <div className="pdf-reader-controls"><div className="page-controls"><button type="button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={!pdfDoc || pageNumber === 1}>← Previous</button><span>Page {pageNumber} of {pdfDoc?.numPages || "—"}</span><button type="button" onClick={() => setPageNumber((page) => Math.min(pdfDoc?.numPages || page, page + 1))} disabled={!pdfDoc || pageNumber === pdfDoc.numPages}>Next →</button></div></div>
              </aside>}
              <div className="upload-controls">
                <label className="upload-dropzone" htmlFor="material-file" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}>
                  <input id="material-file" name="material" type="file" accept=".pdf,.doc,.docx,.txt,image/*" onChange={(event) => selectFile(event.target.files[0])} required />
                  <span className="upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" /></svg></span>
                  <strong>{fileName || "Drop your material here"}</strong>
                  <small>{fileName ? "Ready to translate" : "or click to browse from your device"}</small>
                </label>

                <p className="accepted-label">Accepted formats</p>
                <div className="format-list" aria-label="Accepted formats">
                  {[
                    ["PDF", ""], ["DOC", "Word"], ["TXT", "Notes"],
                    ["PLAN", "Lesson Plan"], ["QP", "Question Paper"], ["IMG", "Image"]
                  ].map(([code, label]) => <span key={code}><b>{code}</b>{label && <small>{label}</small>}</span>)}
                </div>

                <label className="keyword-field">Additional keywords to keep (optional)<input name="keywords" type="text" placeholder="Add any terms you want to protect" /></label>

                <div className="language-selectors">
                  <label>Source Language<select name="sourceLanguage" defaultValue="English">{languages.map((language) => <option key={language}>{language}</option>)}</select></label>
                  <span className="language-arrow" aria-hidden="true">→</span>
                  <label>Target Language<select name="targetLanguage" defaultValue="Hindi">{languages.map((language) => <option key={language}>{language}</option>)}</select></label>
                </div>

                <button className="translate-button" type="submit" disabled={translating || savingMaterial || !materialFile || !materialId}><span>{savingMaterial ? "Saving material…" : translating ? `Translating page ${pageNumber}…` : "Translate This Page"}</span><b aria-hidden="true">→</b></button>
                {translationError && <p className="translation-message error" role="alert">{translationError}</p>}
                {Object.keys(translatedPages).length > 0 && !translationError && <p className="translation-message">{translating ? `Translating page ${pageNumber}…` : `${translatedPages[pageNumber]?.keywords?.length || 0} exam terms kept in English`}</p>}
              </div>
            </div>
          </form>
        ) : (
          <div className="empty-panel"><span>{active.slice(0, 1)}</span><strong>{active}</strong><p>Your {active.toLowerCase()} workspace is ready.</p></div>
        )}
      </section>
    </main>
  );
}
