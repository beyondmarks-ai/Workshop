import { BlobServiceClient } from "@azure/storage-blob";
import { gatewayFetch } from "./function-gateway";

let storagePromise;
let storageExpires = 0;

const safePart = (value) => String(value || "file")
  .normalize("NFKC")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^[._-]+|[._-]+$/g, "") || "file";

async function storage() {
  if (!storagePromise || Date.now() > storageExpires - 120000) storagePromise = gatewayFetch("storage-sas").then(async (response) => {
    if (!response.ok) throw new Error(`Storage authorization failed: ${await response.text()}`);
    const { account, sas, expiresAt } = await response.json();
    storageExpires = new Date(expiresAt).getTime();
    return { account, sas, service: new BlobServiceClient(`https://${account}.blob.core.windows.net?${sas}`) };
  });
  return storagePromise;
}

function assertMaterialId(materialId) {
  if (!/^[a-z0-9-]{8,100}$/.test(materialId)) throw new Error("Invalid material ID.");
}

function readUrl(container, blob) {
  return `/api/materials?${new URLSearchParams({ container, blob })}`;
}

export async function uploadMaterial(file) {
  const { service } = await storage();
  const originalName = safePart(file.name);
  const baseName = originalName.replace(/\.[^.]+$/, "") || "material";
  const materialId = `${baseName.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
  const blobName = `${materialId}/${originalName}`;
  const blob = service.getContainerClient("materials").getBlockBlobClient(blobName);
  await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
    blobHTTPHeaders: { blobContentType: file.type || "application/octet-stream" },
    metadata: {
      documentid: materialId,
      originalname: encodeURIComponent(file.name),
      uploadedat: new Date().toISOString()
    }
  });
  return { id: materialId, name: file.name, blobName };
}

export async function getMaterialFile(materialId) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const container = service.getContainerClient("materials");
  for await (const item of container.listBlobsFlat({ prefix: `${materialId}/`, includeMetadata: true })) {
    let name = item.name.split("/").at(-1);
    try { name = decodeURIComponent(item.metadata?.originalname || name); } catch {}
    return {
      name,
      contentType: item.properties.contentType || "application/pdf",
      data: await container.getBlobClient(item.name).downloadToBuffer()
    };
  }
  throw new Error("Material not found.");
}

export async function getStoredFile(containerName, blobName) {
  if (!["materials", "translated", "audio"].includes(containerName) || !/^[a-z0-9._/-]{1,500}$/i.test(blobName)) throw new Error("Invalid stored file.");
  const { service } = await storage();
  const blob = service.getContainerClient(containerName).getBlobClient(blobName);
  const properties = await blob.getProperties();
  return { data: await blob.downloadToBuffer(), contentType: properties.contentType || "application/octet-stream" };
}

export async function getUser(userId) {
  if (!/^[a-f0-9]{64}$/.test(userId)) return null;
  const { service } = await storage();
  const blob = service.getContainerClient("users").getBlockBlobClient(`${userId}.json`);
  if (!await blob.exists()) return null;
  return JSON.parse((await blob.downloadToBuffer()).toString("utf8"));
}

export async function saveUser(user) {
  if (!/^[a-f0-9]{64}$/.test(user.id)) throw new Error("Invalid user ID.");
  const { service } = await storage();
  const body = JSON.stringify(user);
  await service.getContainerClient("users").getBlockBlobClient(`${user.id}.json`).upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  });
}

export async function saveTranslation({ materialId, fileName, targetLanguage, pageNumber, page }) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const baseName = safePart(fileName).replace(/\.[^.]+$/, "") || "material";
  const language = safePart(targetLanguage).toLowerCase();
  const blobName = `${materialId}/${language}/${baseName}-${language}-page-${String(pageNumber).padStart(3, "0")}.json`;
  const blob = service.getContainerClient("translated").getBlockBlobClient(blobName);
  await blob.upload(JSON.stringify(page), Buffer.byteLength(JSON.stringify(page)), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
    metadata: { documentid: materialId, language, page: String(pageNumber) }
  });
}

export async function getTranslationPages(materialId, language, startPage, endPage) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const container = service.getContainerClient("translated");
  const pages = [];
  for await (const item of container.listBlobsFlat({ prefix: `${materialId}/${safePart(language).toLowerCase()}/`, includeMetadata: true })) {
    const pageNumber = Number(item.metadata?.page);
    if (!Number.isInteger(pageNumber) || pageNumber < startPage || pageNumber > endPage) continue;
    const body = await container.getBlobClient(item.name).downloadToBuffer();
    pages.push(JSON.parse(body.toString("utf8")));
  }
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

export async function getPageKeywords(materialId, pageNumber) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const container = service.getContainerClient("translated");
  const keywords = new Set();
  for await (const item of container.listBlobsFlat({ prefix: `${materialId}/`, includeMetadata: true })) {
    if (Number(item.metadata?.page) !== pageNumber) continue;
    const body = await container.getBlobClient(item.name).downloadToBuffer();
    const page = JSON.parse(body.toString("utf8"));
    (page.keywords || []).forEach((keyword) => keywords.add(keyword));
  }
  return [...keywords];
}

export async function saveAudio({ materialId, language, name, data, contentType, page, model, speaker, pace, sourceType }) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const safeLanguage = safePart(language).toLowerCase();
  const blobName = `${materialId}/${safeLanguage}/${safePart(name)}`;
  const blob = service.getContainerClient("audio").getBlockBlobClient(blobName);
  await blob.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType || "audio/mpeg" },
    metadata: {
      documentid: materialId,
      language: safeLanguage,
      page: String(page || ""),
      model: safePart(model),
      speaker: safePart(speaker),
      pace: String(pace || 1),
      source: sourceType === "original" ? "original" : "translated"
    }
  });
  return blobName;
}

export async function getAudioLesson({ materialId, language, sourceType, model, speaker, pace }) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const container = service.getContainerClient("audio");
  const matches = [];
  for await (const item of container.listBlobsFlat({ prefix: `${materialId}/${safePart(language).toLowerCase()}/`, includeMetadata: true })) {
    const source = item.metadata?.source || (item.name.includes("-original-") ? "original" : "translated");
    if (source !== sourceType || item.metadata?.model !== model || item.metadata?.speaker !== speaker || Number(item.metadata?.pace || 1) !== Number(pace)) continue;
    matches.push({ name: item.name, page: Number(item.metadata?.page || 0) });
  }
  matches.sort((a, b) => a.page - b.page);
  return Promise.all(matches.map(async (item) => ({ ...item, data: await container.getBlobClient(item.name).downloadToBuffer() })));
}

export async function renameMaterial(materialId, name) {
  assertMaterialId(materialId);
  const { service } = await storage();
  const container = service.getContainerClient("materials");
  for await (const item of container.listBlobsFlat({ prefix: `${materialId}/`, includeMetadata: true })) {
    const blob = container.getBlobClient(item.name);
    await blob.setMetadata({
      ...item.metadata,
      originalname: encodeURIComponent(name)
    });
    return;
  }
  throw new Error("Material not found.");
}

export async function deleteMaterial(materialId) {
  assertMaterialId(materialId);
  const { service } = await storage();
  await Promise.all(["materials", "translated", "audio"].map(async (containerName) => {
    const container = service.getContainerClient(containerName);
    for await (const item of container.listBlobsFlat({ prefix: `${materialId}/` })) {
      await container.deleteBlob(item.name, { deleteSnapshots: "include" });
    }
  }));
}

async function list(container) {
  const blobs = [];
  for await (const blob of container.listBlobsFlat({ includeMetadata: true })) blobs.push(blob);
  return blobs;
}

export async function listMaterials() {
  const { service } = await storage();
  const materials = service.getContainerClient("materials");
  const translated = service.getContainerClient("translated");
  const audio = service.getContainerClient("audio");
  const [originals, translations, audioFiles] = await Promise.all([list(materials), list(translated), list(audio)]);

  return originals.map((blob) => {
    const id = blob.name.split("/")[0];
    const translationFiles = translations.filter((item) => item.name.startsWith(`${id}/`));
    const lessonFiles = audioFiles.filter((item) => item.name.startsWith(`${id}/`));
    let name = blob.name.split("/").at(-1);
    try { name = decodeURIComponent(blob.metadata?.originalname || name); } catch {}
    return {
      id,
      name,
      size: blob.properties.contentLength || 0,
      uploadedAt: blob.metadata?.uploadedat || blob.properties.createdOn,
      originalUrl: readUrl("materials", blob.name),
      translations: translationFiles.map((item) => ({
        name: item.name.split("/").at(-1),
        language: item.metadata?.language || item.name.split("/")[1],
        page: Number(item.metadata?.page || 1),
        url: readUrl("translated", item.name)
      })),
      audioLessons: lessonFiles.map((item) => ({
        name: item.name.split("/").at(-1),
        language: item.metadata?.language || item.name.split("/")[1],
        page: Number(item.metadata?.page || 0),
        model: item.metadata?.model || "",
        speaker: item.metadata?.speaker || "",
        pace: Number(item.metadata?.pace || 1),
        sourceType: item.metadata?.source || (item.name.includes("-original-") ? "original" : "translated"),
        url: readUrl("audio", item.name)
      }))
    };
  }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}
